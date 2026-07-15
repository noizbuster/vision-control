import type { BackgroundDefinition } from "wxt";
import { defineBackground } from "wxt/utils/define-background";
import { handleFrameHello } from "../src/background-frame-hello.js";
import { createBackgroundTabLifecycle } from "../src/background-tab-lifecycle.js";
import { refreshHostAccess } from "../src/host-access-refresh.js";
import { isAllowedUrl, STORAGE_KEY } from "../src/host-allowlist.js";
import { HostAllowlistCache } from "../src/host-allowlist-sync.js";
import { installBackgroundJournalHandlers } from "../src/journal/background-journal-handlers.js";
import {
  createBridgeSnapshotPushController,
  parseSelectionSummaryPayload,
} from "../src/journal/bridge-snapshot-push.js";
import { SessionJournalStore } from "../src/journal/session-journal-store.js";
import {
  ActiveSessionTracker,
  createBackgroundBus,
  createBridgeBackgroundController,
  createChromeRouterTransport,
  createConnectionStateMessage,
  createEditForwarder,
  createSessionUpdateMessage,
  createWebNavigationFrameProvider,
  discoverFrames,
  MessageRouter,
  TabSessionStore,
} from "../src/messaging/index.js";
import type { BusMessage, TabSession } from "../src/messaging/types.js";
import {
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  createBackgroundCommandRouter,
  LOCAL_VERIFY_MESSAGE_TYPE,
  LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
} from "../src/verification/index.js";

function broadcastToPanel(message: BusMessage): void {
  if (typeof chrome === "undefined" || chrome.runtime?.sendMessage === undefined) {
    return;
  }
  void chrome.runtime.sendMessage(message).catch(() => {
    // no-excuse-ok: catch — panel may not be open; dropped messages are expected.
  });
}

function reportBackgroundError(context: string): (err: unknown) => void {
  return (err) => {
    console.error(`[vc] ${context}`, err);
  };
}

function chromeLocalStorageArea():
  | {
      get: (key: string) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      remove: (key: string) => Promise<void>;
    }
  | undefined {
  if (typeof chrome === "undefined" || chrome.storage?.local === undefined) {
    return undefined;
  }
  const area = chrome.storage.local;
  return {
    get: (key) => area.get(key) as Promise<Record<string, unknown>>,
    set: (items) => area.set(items),
    remove: (key) => area.remove(key),
  };
}

const background: BackgroundDefinition = defineBackground(() => {
  const hostAllowlist = new HostAllowlistCache();
  const localStorage = chromeLocalStorageArea();
  const activeSessions = new ActiveSessionTracker();

  const store = new TabSessionStore({
    storage: chrome.storage?.session,
    generateSessionId: () => crypto.randomUUID(),
    handlers: {
      onSessionCreated(tabId: number, session: TabSession) {
        broadcastToPanel(createSessionUpdateMessage(tabId, session));
      },
      onSessionUpdated(tabId: number, session: TabSession) {
        broadcastToPanel(createSessionUpdateMessage(tabId, session));
      },
    },
  });

  void store.restore();

  const journalStore = new SessionJournalStore({
    storage: chrome.storage?.session,
  });
  void journalStore.restore();

  const tabLifecycle = createBackgroundTabLifecycle({
    store,
    getGrantedHosts: () => hostAllowlist.getHosts(),
    discoverFrames: (tabId) => discoverFrames(tabId, createWebNavigationFrameProvider()),
  });

  function refreshOpenTabHostAccess(context: string): void {
    void refreshHostAccess({
      hostAllowlist,
      injectOpenTabs: tabLifecycle.injectOpenTabs,
    }).catch(reportBackgroundError(context));
  }

  void hostAllowlist
    .initialize()
    .then(() => tabLifecycle.injectOpenTabs())
    .catch(reportBackgroundError("host allowlist initialization failed"));

  if (typeof chrome !== "undefined") {
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === "local" && STORAGE_KEY in changes) {
        refreshOpenTabHostAccess("host allowlist sync failed");
      }
    });
    chrome.permissions?.onAdded?.addListener(() => {
      refreshOpenTabHostAccess("host permission sync failed");
    });
    chrome.permissions?.onRemoved?.addListener(() => {
      refreshOpenTabHostAccess("host permission reconciliation failed");
    });
  }

  const router = new MessageRouter({
    transport: createChromeRouterTransport(),
    tabSessionStore: store,
    logger: console,
  });
  router.start();

  const backgroundBus = createBackgroundBus();

  const sendToTabContent = (tabId: number, message: BusMessage): void => {
    if (typeof chrome === "undefined" || chrome.tabs?.sendMessage === undefined) {
      return;
    }
    void chrome.tabs.sendMessage(tabId, message).catch(() => {
      // no-excuse-ok: catch — content script may not be loaded yet.
    });
  };

  let bridgeRef: ReturnType<typeof createBridgeBackgroundController> | undefined;

  const snapshotPush = createBridgeSnapshotPushController({
    getClient: () => bridgeRef?.getClient(),
    getJournal: (tabId) => journalStore.get(tabId),
    getSessionId: (tabId) => store.get(tabId)?.sessionId,
  });

  const journalHandlers = installBackgroundJournalHandlers({
    store: journalStore,
    bus: backgroundBus,
    broadcastToPanel,
    sendToTabContent,
    onJournalChanged: (tabId) => {
      snapshotPush.noteJournalChanged(tabId);
    },
  });

  const commandRouter = createBackgroundCommandRouter({
    getClient: () => bridgeRef?.getClient(),
    getActiveTabId: () => activeSessions.getActiveTabId() ?? activeSessions.getPairedTabIds()[0],
    getJournal: (tabId) => journalStore.get(tabId),
    getSessionId: (tabId) => store.get(tabId)?.sessionId,
    sendToTabContent,
    broadcastToPanel,
  });

  const bridge = createBridgeBackgroundController({
    storage: localStorage,
    onStateChange: (state) => {
      broadcastToPanel(createConnectionStateMessage(state));
    },
    onClientReady: (client) => {
      commandRouter.attachClient(client);
      const activeTabId = activeSessions.getActiveTabId() ?? activeSessions.getPairedTabIds()[0];
      if (activeTabId !== undefined) {
        snapshotPush.pushForTab(activeTabId);
      }
    },
  });
  bridgeRef = bridge;

  void bridge.runSwWakePolicy().catch(reportBackgroundError("bridge SW wake policy failed"));

  backgroundBus.on(BRIDGE_COMMAND_RESULT_MESSAGE_TYPE, (message) => {
    commandRouter.handleContentResult(message);
  });
  backgroundBus.on(LOCAL_VERIFY_RESULT_MESSAGE_TYPE, (message) => {
    commandRouter.handleContentResult(message);
  });
  backgroundBus.on(LOCAL_VERIFY_MESSAGE_TYPE, (message, sender) => {
    const tabId = message.tabId ?? sender?.tabId;
    if (tabId !== undefined) {
      commandRouter.requestLocalVerify(tabId);
    }
  });

  backgroundBus.on("frame-hello", (message, sender) => {
    handleFrameHello(message, sender, {
      store,
      isUrlAllowed: (url) => isAllowedUrl(url, hostAllowlist.getHosts()),
    });
  });

  backgroundBus.on("selection-summary", (message, sender) => {
    const tabId = message.tabId ?? sender?.tabId;
    if (tabId === undefined) {
      return;
    }
    const selection = parseSelectionSummaryPayload(message.payload);
    if (selection === undefined) {
      return;
    }
    snapshotPush.noteSelection(tabId, selection);
  });

  const handleBridgeConnect = (message: BusMessage): void => {
    const payload = message.payload as { readonly pairingUrl: string } | undefined;
    const pairingUrl = payload?.pairingUrl;
    if (pairingUrl === undefined) {
      return;
    }
    if (message.tabId !== undefined) {
      activeSessions.markPaired(message.tabId);
      activeSessions.setFocused(message.tabId);
    }
    void bridge.pairWithInput(pairingUrl).catch(reportBackgroundError("bridge pair failed"));
  };

  // Preferred bridge-* names and mid-migration daemon-* aliases (task 3).
  backgroundBus.on("bridge-connect", handleBridgeConnect);
  backgroundBus.on("bridge-disconnect", () => {
    activeSessions.clear();
    bridge.unpair();
  });
  backgroundBus.on("daemon-connect", handleBridgeConnect);
  backgroundBus.on("daemon-disconnect", () => {
    activeSessions.clear();
    bridge.unpair();
  });

  backgroundBus.on("host-access-changed", () => {
    refreshOpenTabHostAccess("host access refresh failed");
  });

  const forwardEditToContent = createEditForwarder({
    store,
    isUrlAllowed: (url) => isAllowedUrl(url, hostAllowlist.getHosts()),
    sendToFrame: (tabId, frameId, message) => {
      if (typeof chrome === "undefined" || chrome.tabs?.sendMessage === undefined) {
        return;
      }
      void chrome.tabs.sendMessage(tabId, message, { frameId }).catch(() => {
        // no-excuse-ok: catch — content script may not be loaded yet.
      });
    },
  });

  backgroundBus.on("editor-command", (message, sender) => {
    const tabId = message.tabId ?? sender?.tabId;
    if (tabId !== undefined) {
      forwardEditToContent({ ...message, tabId });
    }
  });

  backgroundBus.on("clear-preview", (message, sender) => {
    const tabId = message.tabId ?? sender?.tabId;
    if (tabId !== undefined) {
      forwardEditToContent({ ...message, tabId });
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    tabLifecycle.handleUpdated(tabId, changeInfo, tab);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabLifecycle.handleRemoved(tabId);
    journalHandlers.handleTabRemoved(tabId);
    snapshotPush.clearTab(tabId);
    activeSessions.markUnpaired(tabId);
  });

  chrome.tabs.onActivated?.addListener((activeInfo) => {
    activeSessions.setFocused(activeInfo.tabId);
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "vision-control-panel") {
      return;
    }
    refreshOpenTabHostAccess("panel host access refresh failed");
    const tabId = port.sender?.tab?.id;
    if (tabId !== undefined) {
      store.setInspected(tabId, true);
      activeSessions.setFocused(tabId);
    }
    const session = tabId === undefined ? undefined : store.get(tabId);
    if (tabId !== undefined && session !== undefined) {
      port.postMessage(createSessionUpdateMessage(tabId, session));
    }
    port.postMessage(createConnectionStateMessage(bridge.getConnectionState()));
  });
});

export default background;
