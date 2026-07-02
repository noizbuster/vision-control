import type { BusMessage, BusMessageHandler, BusRoute, MessageContext } from "./types.js";

export interface BusTransport {
  readonly route: BusRoute;
  send(targetRoute: BusRoute, message: BusMessage): void | Promise<void>;
  subscribe(handler: (message: BusMessage, sender: MessageContext) => void): () => void;
}

export interface MessageBusOptions {
  readonly route: BusRoute;
  readonly transport: BusTransport;
  /** Override the default filter. Used by the background router to see all traffic. */
  readonly accept?: (message: BusMessage) => boolean;
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

function senderContextFromChrome(
  sender: chrome.runtime.MessageSender,
  sourceRoute?: BusRoute,
): MessageContext {
  return {
    route: sourceRoute ?? "unknown",
    tabId: sender.tab?.id,
    frameId: sender.frameId,
    sessionId: undefined,
  };
}

function createRuntimeTransport(route: BusRoute): BusTransport {
  return {
    route,
    send: (_targetRoute, message) => {
      if (typeof chrome === "undefined" || chrome.runtime?.sendMessage === undefined) {
        return;
      }
      void chrome.runtime.sendMessage(message).catch(() => {
        // Fire-and-forget transport; delivery failures are surfaced by higher layers.
      });
    },
    subscribe: (handler) => {
      if (typeof chrome === "undefined" || chrome.runtime?.onMessage === undefined) {
        return () => {};
      }
      const listener = (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        _sendResponse: (response?: unknown) => void,
      ): undefined => {
        if (!isBusMessage(message)) {
          return;
        }
        const context = senderContextFromChrome(sender, message.sourceRoute);
        void handler(message, context);
        return undefined;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => {
        chrome.runtime.onMessage.removeListener(listener);
      };
    },
  };
}

/**
 * Typed message bus for one extension context.
 *
 * A bus is both a local pub/sub (by `messageType`) and a transport wrapper over
 * the Chrome messaging APIs. Each context creates exactly one bus instance.
 */
export class MessageBus {
  private readonly route: BusRoute;
  private readonly transport: BusTransport;
  private readonly accept: (message: BusMessage) => boolean;
  private readonly handlers = new Map<string, Set<BusMessageHandler>>();
  private unsubscribeTransport: (() => void) | undefined;

  constructor(options: MessageBusOptions) {
    this.route = options.route;
    this.transport = options.transport;
    this.accept = options.accept ?? ((message) => message.targetRoute === this.route);
    this.unsubscribeTransport = options.transport.subscribe((message, sender) =>
      this.receive(message, sender),
    );
  }

  getRoute(): BusRoute {
    return this.route;
  }

  /**
   * Send a message to a target route. The local bus stamps the message with the
   * current context's route as `sourceRoute`.
   */
  send(targetRoute: BusRoute, message: Omit<BusMessage, "sourceRoute" | "targetRoute">): void {
    const envelope: BusMessage = {
      ...message,
      sourceRoute: this.route,
      targetRoute,
    };
    void this.transport.send(targetRoute, envelope);
  }

  on(messageType: string, handler: BusMessageHandler): () => void {
    let set = this.handlers.get(messageType);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(messageType, set);
    }
    set.add(handler);
    return () => {
      this.off(messageType, handler);
    };
  }

  off(messageType: string, handler: BusMessageHandler): void {
    const set = this.handlers.get(messageType);
    if (set === undefined) {
      return;
    }
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(messageType);
    }
  }

  dispose(): void {
    this.handlers.clear();
    if (this.unsubscribeTransport !== undefined) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = undefined;
    }
  }

  private receive(message: BusMessage, sender: MessageContext): void {
    if (!this.accept(message)) {
      return;
    }
    const set = this.handlers.get(message.messageType);
    if (set === undefined) {
      return;
    }
    for (const handler of set) {
      void handler(message, sender);
    }
  }
}

export function createRuntimeBus(route: BusRoute): MessageBus {
  return new MessageBus({ route, transport: createRuntimeTransport(route) });
}

export function createBackgroundBus(): MessageBus {
  return new MessageBus({
    route: "background",
    transport: createRuntimeTransport("background"),
    accept: () => true,
  });
}
