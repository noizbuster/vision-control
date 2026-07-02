import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageRouter, type RouterTransport } from "../router.js";
import { TabSessionStore } from "../tab-session.js";
import type { BusMessage, FrameInfo, MessageContext } from "../types.js";

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

describe("tab and frame isolation", () => {
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

    const tree: FrameInfo[] = [
      {
        frameId: 0,
        url: "http://localhost:3000/",
        origin: "http://localhost:3000",
        routeable: true,
      },
      {
        frameId: 1,
        url: "http://localhost:3000/child",
        origin: "http://localhost:3000",
        routeable: true,
      },
      {
        frameId: 2,
        url: "http://other.local/page",
        origin: "http://other.local",
        routeable: false,
      },
    ];
    store.updateFrameTree(1, tree);
  });

  it("does not let tab A's content script send a message to tab B", async () => {
    const message = makeMessage({
      messageType: "select-element",
      targetRoute: "content",
      tabId: 2,
      frameId: 0,
    });

    transport.receive(message, { route: "content", tabId: 1, frameId: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.frames).toHaveLength(0);
  });

  it("rejects a message whose frameId is not in the discovered tree", async () => {
    const message = makeMessage({
      messageType: "select-element",
      targetRoute: "content",
      tabId: 1,
      frameId: 99,
    });

    transport.receive(message, { route: "panel" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.frames).toHaveLength(0);
  });

  it("reports a cross-origin frame as opaque and refuses to route into it", async () => {
    const message = makeMessage({
      messageType: "edit-request",
      targetRoute: "content",
      tabId: 1,
      frameId: 2,
    });

    transport.receive(message, { route: "panel" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.frames).toHaveLength(0);
  });
});

describe("context permission isolation", () => {
  it("blocks a content script from sending a daemon call directly", async () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-perm" });
    const transport = createFakeRouterTransport();
    const router = new MessageRouter({
      transport,
      tabSessionStore: store,
      logger: { warn: vi.fn() },
    });
    router.start();

    const message = makeMessage({
      messageType: "daemon:source.request",
      targetRoute: "background",
      tabId: 1,
      frameId: 0,
    });

    transport.receive(message, { route: "content", tabId: 1, frameId: 0 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(transport.broadcasts).toHaveLength(0);
    expect(transport.frames).toHaveLength(0);
  });
});
