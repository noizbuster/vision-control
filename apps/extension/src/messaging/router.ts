import { checkSendPermission } from "./context-permissions.js";
import type { TabSessionStore } from "./tab-session.js";
import type { BusMessage, MessageContext } from "./types.js";

export interface RouterTransport {
  readonly sendToFrame: (tabId: number, frameId: number, message: BusMessage) => Promise<void>;
  readonly broadcast: (message: BusMessage) => Promise<void>;
  readonly subscribe: (
    handler: (message: BusMessage, sender: MessageContext) => void,
  ) => () => void;
}

export interface RouterLogger {
  readonly warn: (message: string, context?: Record<string, unknown>) => void;
  readonly info?: (message: string, context?: Record<string, unknown>) => void;
}

export interface MessageRouterOptions {
  readonly transport: RouterTransport;
  readonly tabSessionStore: TabSessionStore;
  readonly logger?: RouterLogger;
}

/**
 * Central background router.
 *
 * Receives every runtime message, validates context permissions, enforces tab
 * and frame isolation, and forwards messages to the correct content-script
 * frame via `chrome.tabs.sendMessage(tabId, message, { frameId })`.
 */
export class MessageRouter {
  private readonly transport: RouterTransport;
  private readonly tabSessionStore: TabSessionStore;
  private readonly logger: RouterLogger;
  private unsubscribe: (() => void) | undefined;

  constructor(options: MessageRouterOptions) {
    this.transport = options.transport;
    this.tabSessionStore = options.tabSessionStore;
    this.logger = options.logger ?? console;
  }

  start(): () => void {
    if (this.unsubscribe !== undefined) {
      return this.unsubscribe;
    }
    this.unsubscribe = this.transport.subscribe((message, sender) => {
      void this.handle(message, sender);
    });
    return this.unsubscribe;
  }

  stop(): void {
    if (this.unsubscribe !== undefined) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  private async handle(message: BusMessage, sender: MessageContext): Promise<void> {
    const permission = checkSendPermission(sender, message);
    if (!permission.allowed) {
      this.logger.warn("dropped message: permission denied", {
        reason: permission.reason,
        messageType: message.messageType,
        sender,
      });
      return;
    }

    if (message.targetRoute === "content") {
      await this.routeToContent(message);
      return;
    }

    if (message.targetRoute === "panel") {
      await this.transport.broadcast(message);
      return;
    }

    if (message.targetRoute === "background") {
      return;
    }

    if (message.targetRoute === "daemon") {
      // Daemon messages are consumed by the background reconnect manager, not
      // the router. If one reaches here it means the daemon manager is absent;
      // log and drop rather than leak it to another context.
      this.logger.warn("dropped message: no daemon handler registered", {
        messageType: message.messageType,
      });
    }
  }

  private async routeToContent(message: BusMessage): Promise<void> {
    const tabId = message.tabId;
    const frameId = message.frameId;

    if (tabId === undefined) {
      this.logger.warn("dropped message: missing tabId", { messageType: message.messageType });
      return;
    }

    const session = this.tabSessionStore.get(tabId);
    if (session === undefined) {
      this.logger.warn("dropped message: unknown tab session", { tabId });
      return;
    }

    if (frameId === undefined) {
      this.logger.warn("dropped message: missing frameId", {
        tabId,
        messageType: message.messageType,
      });
      return;
    }

    const frame = session.frameTree.find((f) => f.frameId === frameId);
    if (frame === undefined) {
      this.logger.warn("dropped message: frameId not in discovered tree", {
        tabId,
        frameId,
      });
      return;
    }

    if (!frame.routeable) {
      this.logger.warn("dropped message: target frame is opaque (cross-origin)", {
        tabId,
        frameId,
        url: frame.url,
      });
      return;
    }

    await this.transport.sendToFrame(tabId, frameId, message);
  }
}

export function createChromeRouterTransport(): RouterTransport {
  return {
    sendToFrame: async (tabId, frameId, message) => {
      if (typeof chrome === "undefined" || chrome.tabs?.sendMessage === undefined) {
        return;
      }
      await chrome.tabs.sendMessage(tabId, message, { frameId });
    },
    broadcast: async (message) => {
      if (typeof chrome === "undefined" || chrome.runtime?.sendMessage === undefined) {
        return;
      }
      await chrome.runtime.sendMessage(message);
    },
    subscribe: (handler) => {
      if (typeof chrome === "undefined" || chrome.runtime?.onMessage === undefined) {
        return () => {};
      }
      const listener = (
        msg: unknown,
        sender: chrome.runtime.MessageSender,
        _sendResponse: (response?: unknown) => void,
      ): undefined => {
        if (!isBusMessage(msg)) {
          return;
        }
        const context: MessageContext = {
          route: msg.sourceRoute ?? "unknown",
          tabId: sender.tab?.id,
          frameId: sender.frameId,
          sessionId: msg.sessionId,
        };
        void handler(msg, context);
        return undefined;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    },
  };
}

function isBusMessage(value: unknown): value is BusMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.protocolVersion === "string" &&
    typeof obj.messageId === "string" &&
    typeof obj.messageType === "string" &&
    typeof obj.timestamp === "number" &&
    "payload" in obj
  );
}
