import { DaemonClient, parsePairingUrl } from "@vision-control/daemon-client";
import type { BackgroundDefinition } from "wxt";
import { defineBackground } from "wxt/utils/define-background";
import { handleFrameHello } from "../src/background-frame-hello.js";
import { createBackgroundTabLifecycle } from "../src/background-tab-lifecycle.js";
import { refreshHostAccess } from "../src/host-access-refresh.js";
import { isAllowedUrl, STORAGE_KEY } from "../src/host-allowlist.js";
import { HostAllowlistCache } from "../src/host-allowlist-sync.js";
import {
  createBackgroundBus,
  createChromeRouterTransport,
  createConnectionStateMessage,
  createEditForwarder,
  createSessionUpdateMessage,
  createWebNavigationFrameProvider,
  discoverFrames,
  MessageRouter,
  ReconnectManager,
  TabSessionStore,
} from "../src/messaging/index.js";
import type { BusMessage, ConnectionState, TabSession } from "../src/messaging/types.js";

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

const background: BackgroundDefinition = defineBackground(() => {
  const hostAllowlist = new HostAllowlistCache();

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
  let reconnectManager: ReconnectManager | undefined;

  function broadcastConnectionState(state: ConnectionState): void {
    broadcastToPanel(createConnectionStateMessage(state));
  }

  backgroundBus.on("frame-hello", (message, sender) => {
    handleFrameHello(message, sender, {
      store,
      isUrlAllowed: (url) => isAllowedUrl(url, hostAllowlist.getHosts()),
    });
  });

  function handleBridgeConnect(message: BusMessage): void {
    const payload = message.payload as { readonly pairingUrl: string } | undefined;
    const pairingUrl = payload?.pairingUrl;
    if (pairingUrl === undefined) {
      return;
    }
    const parsed = parsePairingUrl(pairingUrl);
    if (!parsed.success) {
      broadcastConnectionState("disconnected");
      return;
    }
    reconnectManager?.disconnect();
    const client = new DaemonClient({ target: parsed.target });
    reconnectManager = new ReconnectManager({
      client,
      onStateChange: broadcastConnectionState,
    });
    void reconnectManager.connect().catch(() => {});
  }

  function handleBridgeDisconnect(): void {
    reconnectManager?.disconnect();
    reconnectManager = undefined;
    broadcastConnectionState("disconnected");
  }

  // bridge-* preferred; daemon-* legacy aliases (mid-migration, no permission break).
  backgroundBus.on("bridge-connect", handleBridgeConnect);
  backgroundBus.on("daemon-connect", handleBridgeConnect);
  backgroundBus.on("bridge-disconnect", handleBridgeDisconnect);
  backgroundBus.on("daemon-disconnect", handleBridgeDisconnect);

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
    // Fall back to the sender context's tabId (the bus transport derives it
    // from chrome.runtime.MessageSender.tab.id) so an edit is never silently
    // dropped when the message envelope omits tabId.
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
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "vision-control-panel") {
      return;
    }
    refreshOpenTabHostAccess("panel host access refresh failed");
    const tabId = port.sender?.tab?.id;
    if (tabId !== undefined) {
      store.setInspected(tabId, true);
    }
    const session = tabId === undefined ? undefined : store.get(tabId);
    if (tabId !== undefined && session !== undefined) {
      port.postMessage(createSessionUpdateMessage(tabId, session));
    }
    port.postMessage(createConnectionStateMessage(reconnectManager?.getState() ?? "disconnected"));
  });
});

export default background;
