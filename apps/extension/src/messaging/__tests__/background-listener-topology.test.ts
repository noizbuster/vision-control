import { afterEach, describe, expect, it, vi } from "vitest";

import { createBackgroundBus } from "../bus.js";
import { createBridgeConnectMessage, createBridgeDisconnectMessage } from "../panel-messages.js";
import { createChromeRouterTransport, MessageRouter } from "../router.js";
import { TabSessionStore } from "../tab-session.js";
import type { BusMessage } from "../types.js";

type RuntimeMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

function contentSender(tabId: number): chrome.runtime.MessageSender {
  const sender: chrome.runtime.MessageSender = {};
  Object.defineProperty(sender, "tab", { enumerable: true, value: { id: tabId } });
  Object.defineProperty(sender, "frameId", { enumerable: true, value: 0 });
  return sender;
}

function installChromeRuntime(): {
  readonly listeners: Set<RuntimeMessageListener>;
  readonly deliver: (message: BusMessage, sender: chrome.runtime.MessageSender) => void;
} {
  const listeners = new Set<RuntimeMessageListener>();
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: (listener: RuntimeMessageListener) => listeners.add(listener),
        removeListener: (listener: RuntimeMessageListener) => listeners.delete(listener),
      },
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    tabs: {
      sendMessage: vi.fn(() => Promise.resolve()),
    },
  });
  return {
    listeners,
    deliver: (message, sender) => {
      for (const listener of listeners) listener(message, sender, () => {});
    },
  };
}

describe("background Chrome listener topology", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("denies content bridge connect and disconnect to the parallel background listeners", async () => {
    // Given
    const runtime = installChromeRuntime();
    const logger = { warn: vi.fn() };
    const router = new MessageRouter({
      transport: createChromeRouterTransport(),
      tabSessionStore: new TabSessionStore({ generateSessionId: () => "session-topology" }),
      logger,
    });
    router.start();
    const backgroundBus = createBackgroundBus();
    const connectHandler = vi.fn();
    const disconnectHandler = vi.fn();
    backgroundBus.on("bridge-connect", connectHandler);
    backgroundBus.on("bridge-disconnect", disconnectHandler);

    // When
    runtime.deliver(
      { ...createBridgeConnectMessage("vision-control://pair"), sourceRoute: "content" },
      contentSender(71),
    );
    runtime.deliver(
      { ...createBridgeDisconnectMessage(), sourceRoute: "content" },
      contentSender(71),
    );
    runtime.deliver(
      { ...createBridgeConnectMessage("vision-control://pair"), tabId: 71, sourceRoute: "panel" },
      contentSender(71),
    );
    await Promise.resolve();

    // Then
    expect(runtime.listeners).toHaveLength(2);
    expect(connectHandler).not.toHaveBeenCalled();
    expect(disconnectHandler).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(3);

    router.stop();
    backgroundBus.dispose();
    expect(runtime.listeners).toHaveLength(0);
  });

  it("preserves panel and background bridge controls", async () => {
    // Given
    const runtime = installChromeRuntime();
    const router = new MessageRouter({
      transport: createChromeRouterTransport(),
      tabSessionStore: new TabSessionStore({ generateSessionId: () => "session-valid" }),
      logger: { warn: vi.fn() },
    });
    router.start();
    const backgroundBus = createBackgroundBus();
    const connectHandler = vi.fn();
    const disconnectHandler = vi.fn();
    backgroundBus.on("bridge-connect", connectHandler);
    backgroundBus.on("bridge-disconnect", disconnectHandler);

    // When
    runtime.deliver(
      { ...createBridgeConnectMessage("vision-control://pair"), tabId: 72, sourceRoute: "panel" },
      {},
    );
    runtime.deliver({ ...createBridgeDisconnectMessage(), sourceRoute: "background" }, {});
    await Promise.resolve();

    // Then
    expect(connectHandler).toHaveBeenCalledOnce();
    expect(disconnectHandler).toHaveBeenCalledOnce();

    router.stop();
    backgroundBus.dispose();
  });
});
