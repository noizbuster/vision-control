import { DaemonClient, parsePairingUrl } from "@vision-control/daemon-client";
import type { BackgroundDefinition } from "wxt";
import { defineBackground } from "wxt/utils/define-background";
import { buildAllowHostPageUrl } from "../src/allow-host-page.js";
import { STORAGE_KEY } from "../src/host-allowlist.js";
import { HostAllowlistCache, reconcileHostsWithPermissions } from "../src/host-allowlist-sync.js";
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

const background: BackgroundDefinition = defineBackground(() => {
  const hostAllowlist = new HostAllowlistCache();
  void hostAllowlist.initialize();

  if (typeof chrome !== "undefined") {
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === "local" && STORAGE_KEY in changes) {
        void hostAllowlist.sync();
      }
    });
    chrome.permissions?.onAdded?.addListener(() => {
      void hostAllowlist.sync();
    });
    chrome.permissions?.onRemoved?.addListener(() => {
      void reconcileHostsWithPermissions(hostAllowlist);
    });
  }

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
    const tabId = sender.tabId ?? message.tabId;
    if (tabId === undefined || sender.frameId === undefined) {
      return;
    }
    const session = store.ensure(tabId);
    const existing = session.frameTree.find((frame) => frame.frameId === sender.frameId);
    if (existing !== undefined) {
      return;
    }
    const payload = message.payload as
      | { readonly origin?: string; readonly url?: string }
      | undefined;
    const origin = payload?.origin ?? "";
    const url = payload?.url ?? "";
    const topFrame = session.frameTree.find((frame) => frame.frameId === 0);
    const topOrigin = topFrame?.origin ?? origin;
    const frame = {
      frameId: sender.frameId,
      url,
      origin,
      routeable: origin.length > 0 && origin === topOrigin,
    };
    store.updateFrameTree(tabId, [...session.frameTree, frame]);
  });

  backgroundBus.on("daemon-connect", (message) => {
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
  });

  backgroundBus.on("daemon-disconnect", () => {
    reconnectManager?.disconnect();
    reconnectManager = undefined;
  });

  backgroundBus.on("open-allow-host", (message) => {
    if (typeof chrome === "undefined" || chrome.tabs?.create === undefined) {
      return;
    }
    const payload = message.payload as { readonly host?: string } | undefined;
    const host = payload?.host;
    if (typeof host !== "string" || host.length === 0) {
      return;
    }
    void chrome.tabs.create({ url: chrome.runtime.getURL(buildAllowHostPageUrl(host)) });
  });

  const forwardEditToContent = createEditForwarder({
    store,
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
    if (!hostAllowlist.isAllowedUrl(tab.url)) {
      return;
    }
    if (changeInfo.status === "loading") {
      store.resetForReload(tabId);
      return;
    }
    if (changeInfo.status === "complete") {
      store.ensure(tabId);
      void discoverFrames(tabId, createWebNavigationFrameProvider()).then((frames) => {
        store.updateFrameTree(tabId, [...frames]);
      });
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    store.remove(tabId);
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "vision-control-panel") {
      return;
    }
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
