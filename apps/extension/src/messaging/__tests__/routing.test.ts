import { beforeEach, describe, expect, it, vi } from "vitest";

import { type BusTransport, MessageBus } from "../bus.js";
import { MessageRouter, type RouterTransport } from "../router.js";
import { TabSessionStore } from "../tab-session.js";
import type { BusMessage, BusRoute, MessageContext } from "../types.js";

function makeMessage(
  overrides: Partial<BusMessage> & Pick<BusMessage, "messageType" | "targetRoute">,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: "msg-0001",
    timestamp: 1,
    payload: {},
    ...overrides,
  };
}

function createFakeTransport(route: BusRoute): BusTransport & {
  readonly sent: BusMessage[];
  readonly receive: (message: BusMessage, sender?: MessageContext) => void;
} {
  const subscribers = new Set<(message: BusMessage, sender: MessageContext) => void>();
  const sent: BusMessage[] = [];
  return {
    route,
    get sent() {
      return sent;
    },
    send: (_targetRoute, message) => {
      sent.push(message);
    },
    subscribe: (handler) => {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
    receive: (message, sender = { route: "background" }) => {
      for (const handler of subscribers) {
        handler(message, sender);
      }
    },
  };
}

function createFakeRouterTransport(): RouterTransport & {
  readonly frames: Array<{
    readonly tabId: number;
    readonly frameId: number;
    readonly message: BusMessage;
  }>;
  readonly broadcasts: BusMessage[];
  readonly receive: (message: BusMessage, sender?: MessageContext) => void;
} {
  const frames: Array<{
    readonly tabId: number;
    readonly frameId: number;
    readonly message: BusMessage;
  }> = [];
  const broadcasts: BusMessage[] = [];
  const subscribers = new Set<(message: BusMessage, sender: MessageContext) => void>();
  return {
    get frames() {
      return frames;
    },
    get broadcasts() {
      return broadcasts;
    },
    sendToFrame: async (tabId, frameId, message) => {
      frames.push({ tabId, frameId, message });
    },
    broadcast: async (message) => {
      broadcasts.push(message);
    },
    subscribe: (handler) => {
      subscribers.add(handler);
      return () => subscribers.delete(handler);
    },
    receive: (message, sender = { route: "background" }) => {
      for (const handler of subscribers) {
        handler(message, sender);
      }
    },
  };
}

describe("MessageBus", () => {
  it("dispatches received messages to handlers registered for the same messageType", () => {
    const transport = createFakeTransport("panel");
    const bus = new MessageBus({ route: "panel", transport });
    const received: BusMessage[] = [];

    bus.on("ping", (message) => {
      received.push(message);
    });
    transport.receive(
      makeMessage({ messageType: "ping", targetRoute: "panel", sourceRoute: "background" }),
    );

    expect(received).toHaveLength(1);
    expect(received[0]?.messageType).toBe("ping");
  });

  it("stamps sourceRoute when sending", () => {
    const transport = createFakeTransport("panel");
    const bus = new MessageBus({ route: "panel", transport });

    bus.send("background", makeMessage({ messageType: "ping", targetRoute: "background" }));

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.sourceRoute).toBe("panel");
    expect(transport.sent[0]?.targetRoute).toBe("background");
  });

  it("does not dispatch received messages whose targetRoute does not match the bus route", () => {
    const transport = createFakeTransport("content");
    const bus = new MessageBus({ route: "content", transport });
    const received: BusMessage[] = [];

    bus.on("ping", (message) => {
      received.push(message);
    });
    transport.receive(
      makeMessage({ messageType: "ping", targetRoute: "panel", sourceRoute: "background" }),
    );

    expect(received).toHaveLength(0);
  });

  it("removes a handler when the unsubscribe callback is called", () => {
    const transport = createFakeTransport("panel");
    const bus = new MessageBus({ route: "panel", transport });
    const received: BusMessage[] = [];

    const unsubscribe = bus.on("ping", (message) => {
      received.push(message);
    });
    unsubscribe();
    transport.receive(
      makeMessage({ messageType: "ping", targetRoute: "panel", sourceRoute: "background" }),
    );

    expect(received).toHaveLength(0);
  });
});

describe("MessageRouter", () => {
  let store: TabSessionStore;
  let transport: ReturnType<typeof createFakeRouterTransport>;
  let router: MessageRouter;

  beforeEach(() => {
    store = new TabSessionStore({ generateSessionId: () => "sess-test" });
    transport = createFakeRouterTransport();
    router = new MessageRouter({
      transport,
      tabSessionStore: store,
      logger: { warn: vi.fn() },
    });
    router.start();
  });

  it("routes a panel message to the targeted content frame", async () => {
    store.updateFrameTree(1, [
      {
        frameId: 0,
        url: "http://localhost:3000/",
        origin: "http://localhost:3000",
        routeable: true,
      },
    ]);
    const message = makeMessage({
      messageType: "select-element",
      targetRoute: "content",
      tabId: 1,
      frameId: 0,
    });

    transport.receive(message, { route: "panel" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.frames).toHaveLength(1);
    expect(transport.frames[0]).toEqual({ tabId: 1, frameId: 0, message });
  });

  it("broadcasts a background message to all contexts", async () => {
    const message = makeMessage({ messageType: "connection-state", targetRoute: "panel" });

    transport.receive(message, { route: "background" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.broadcasts).toHaveLength(1);
    expect(transport.broadcasts[0]?.messageType).toBe("connection-state");
  });

  it("drops a content-script daemon message", async () => {
    const message = makeMessage({
      messageType: "daemon:source.request",
      targetRoute: "background",
    });

    transport.receive(message, { route: "content", tabId: 1, frameId: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.broadcasts).toHaveLength(0);
    expect(transport.frames).toHaveLength(0);
  });

  it("drops a panel message that is missing tabId", async () => {
    const message = makeMessage({
      messageType: "select-element",
      targetRoute: "content",
      frameId: 0,
    });

    transport.receive(message, { route: "panel" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.frames).toHaveLength(0);
  });
});

describe("TabSessionStore", () => {
  it("preserves the sessionId when the frame tree is updated", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-keep" });
    store.ensure(1);
    store.updateFrameTree(1, [
      { frameId: 0, url: "http://localhost/", origin: "http://localhost", routeable: true },
    ]);

    const session = store.get(1);
    expect(session?.sessionId).toBe("sess-keep");
    expect(session?.frameTree).toHaveLength(1);
  });

  it("removes a session when the tab closes", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-gone" });
    store.ensure(2);
    store.remove(2);

    expect(store.get(2)).toBeUndefined();
  });
});
