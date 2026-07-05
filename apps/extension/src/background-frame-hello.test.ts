import { describe, expect, it, vi } from "vitest";

import { handleFrameHello } from "./background-frame-hello.js";
import type { BusMessage, FrameInfo, MessageContext, TabSession } from "./messaging/index.js";

type StoreMock = {
  readonly ensure: ReturnType<typeof vi.fn<(tabId: number) => TabSession>>;
  readonly updateFrameTree: ReturnType<
    typeof vi.fn<(tabId: number, frameTree: readonly FrameInfo[]) => void>
  >;
};

function createSession(frameTree: readonly FrameInfo[] = []): TabSession {
  return {
    sessionId: "sess-frame-hello",
    inspected: false,
    frameTree,
  };
}

function createStore(session = createSession()): StoreMock {
  return {
    ensure: vi.fn<(tabId: number) => TabSession>(() => session),
    updateFrameTree: vi.fn<(tabId: number, frameTree: readonly FrameInfo[]) => void>(),
  };
}

function createFrameHello(url: string, origin: string): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: "frame-hello-test",
    messageType: "frame-hello",
    payload: { url, origin },
    timestamp: 1,
  };
}

function createSender(tabId: number, frameId: number): MessageContext {
  return {
    route: "content",
    tabId,
    frameId,
  };
}

describe("handleFrameHello", () => {
  it("ignores frame-hello for a URL that is no longer allowed", () => {
    // Given: a stale content script still reports from a revoked host.
    const store = createStore();

    // When: the background receives frame discovery from that URL.
    handleFrameHello(
      createFrameHello("http://subshell:10601/", "http://subshell:10601"),
      createSender(7, 0),
      { store, isUrlAllowed: () => false },
    );

    // Then: no session is created and no routeable frame is registered.
    expect(store.ensure).not.toHaveBeenCalled();
    expect(store.updateFrameTree).not.toHaveBeenCalled();
  });

  it("registers an allowed frame-hello as a routeable top frame", () => {
    // Given: an allowed top-frame hello payload.
    const store = createStore();

    // When: the background handles the frame discovery signal.
    handleFrameHello(
      createFrameHello("http://localhost:3000/", "http://localhost:3000"),
      createSender(7, 0),
      { store, isUrlAllowed: () => true },
    );

    // Then: the frame is added to the tab session as routeable.
    expect(store.updateFrameTree).toHaveBeenCalledWith(7, [
      {
        frameId: 0,
        url: "http://localhost:3000/",
        origin: "http://localhost:3000",
        routeable: true,
      },
    ]);
  });

  it("ignores duplicate frame-hello for a known frame", () => {
    // Given: a tab session already contains the reporting frame.
    const existingFrame: FrameInfo = {
      frameId: 0,
      url: "http://localhost:3000/",
      origin: "http://localhost:3000",
      routeable: true,
    };
    const store = createStore(createSession([existingFrame]));

    // When: the same frame reports again.
    handleFrameHello(
      createFrameHello("http://localhost:3000/", "http://localhost:3000"),
      createSender(7, 0),
      { store, isUrlAllowed: () => true },
    );

    // Then: the frame tree is not duplicated.
    expect(store.updateFrameTree).not.toHaveBeenCalled();
  });
});
