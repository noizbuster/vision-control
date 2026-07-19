import type { BackgroundDefinition } from "wxt";
import { defineBackground } from "wxt/utils/define-background";
import { handleFrameHello } from "../src/background-frame-hello.js";
import { createBackgroundTabLifecycle } from "../src/background-tab-lifecycle.js";
import { refreshHostAccess } from "../src/host-access-refresh.js";
import { isAllowedUrl, STORAGE_KEY } from "../src/host-allowlist.js";
import { HostAllowlistCache } from "../src/host-allowlist-sync.js";
import { createBackgroundJournalRuntime } from "../src/journal/background-journal-runtime.js";
import { parseSelectionSummaryPayload } from "../src/journal/bridge-snapshot-push.js";
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
  installBackgroundOperationRelay,
  MessageRouter,
  TabSessionStore,
} from "../src/messaging/index.js";
import type { BusMessage, TabSession } from "../src/messaging/types.js";
import { LOCAL_VERIFY_MESSAGE_TYPE } from "../src/verification/index.js";

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
    get: async (key) => area.get(key),
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
  installBackgroundOperationRelay({ bus: backgroundBus, broadcastToPanel });

  const sendToTabContent = (tabId: number, message: BusMessage): void => {
    if (typeof chrome === "undefined" || chrome.tabs?.sendMessage === undefined) {
      return;
    }
    const delivery =
      message.frameId === undefined
        ? chrome.tabs.sendMessage(tabId, message)
        : chrome.tabs.sendMessage(tabId, message, { frameId: message.frameId });
    void delivery.catch(() => {
      // no-excuse-ok: catch — content script may not be loaded yet.
    });
  };

  let bridgeRef: ReturnType<typeof createBridgeBackgroundController> | undefined;

  const journalRuntime = createBackgroundJournalRuntime({
    storage: chrome.storage?.session,
    bus: backgroundBus,
    broadcastToPanel,
    sendToTabContent,
    getClient: () => bridgeRef?.getClient(),
    getActiveTabId: () => activeSessions.getActiveTabId() ?? activeSessions.getPairedTabIds()[0],
    getSessionId: (tabId) => store.get(tabId)?.sessionId,
    onTaskError: reportBackgroundError("journal task failed"),
  });
  const { handlers: journalHandlers, snapshotPush } = journalRuntime;

  const bridge = createBridgeBackgroundController({
    storage: localStorage,
    onStateChange: (state) => {
      broadcastToPanel(createConnectionStateMessage(state));
    },
    onClientReady: journalRuntime.handleClientReady,
  });
  bridgeRef = bridge;

  void bridge.runSwWakePolicy().catch(reportBackgroundError("bridge SW wake policy failed"));

  backgroundBus.on(LOCAL_VERIFY_MESSAGE_TYPE, (message, sender) => {
    const tabId = message.tabId ?? sender?.tabId;
    if (tabId !== undefined) {
      journalRuntime.requestLocalVerify(tabId);
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
    journalRuntime.noteSelection(tabId, selection);
  });

  const handleBridgeConnect = (message: BusMessage): void => {
    const payload = message.payload;
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("pairingUrl" in payload) ||
      typeof payload.pairingUrl !== "string"
    ) {
      return;
    }
    const pairingUrl = payload.pairingUrl;
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
    snapshotPush.clearTab(tabId);
    tabLifecycle.handleRemoved(tabId);
    journalHandlers.handleTabRemoved(tabId);
    activeSessions.markUnpaired(tabId);
    const activeTabId = activeSessions.getActiveTabId();
    if (activeTabId !== undefined) snapshotPush.focusTab(activeTabId);
  });

  chrome.tabs.onActivated?.addListener((activeInfo) => {
    activeSessions.setFocused(activeInfo.tabId);
    if (activeSessions.getActiveTabId() === activeInfo.tabId) {
      snapshotPush.focusTab(activeInfo.tabId);
    }
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
