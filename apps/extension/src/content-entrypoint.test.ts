import { parsePairingUrl } from "@vision-control/daemon-client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type ContentEntrypointBus,
  type ContentEntrypointDependencies,
  runVisionControlContentScript,
} from "../entrypoints/content.js";
import type { BusRoute } from "./messaging/index.js";
import type { ContentEditWiring } from "./overlay/content-edit-wiring.js";
import type { OverlayRuntime } from "./overlay/overlay-runtime.js";

type SentMessage = {
  readonly route: BusRoute;
  readonly message: Parameters<ContentEntrypointBus["send"]>[1];
};

type FakeBus = ContentEntrypointBus & {
  readonly sent: SentMessage[];
};

type HarnessOptions = {
  readonly routeable?: boolean;
  readonly href?: string;
  readonly mainFrame?: boolean;
};

type ContentHarness = {
  readonly bus: FakeBus;
  readonly createBus: ContentEntrypointDependencies["createBus"];
  readonly createRuntime: ContentEntrypointDependencies["createRuntime"];
  readonly deps: ContentEntrypointDependencies;
  readonly editHandlers: ContentEditWiring;
  readonly runtime: OverlayRuntime;
  readonly wireEditHandlers: ContentEntrypointDependencies["wireEditHandlers"];
  readonly pageWindow: PageWindow;
};

function unexpectedCall(): never {
  throw new Error("This test path should not call the full overlay runtime");
}

function createFakeBus(): FakeBus {
  const sent: SentMessage[] = [];
  return {
    sent,
    send: (route, message) => {
      sent.push({ route, message });
    },
    on: () => () => {},
    dispose: vi.fn(),
  };
}

function createFakeRuntime(): OverlayRuntime {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    getInspector: unexpectedCall,
    getInteractionControllers: () => null,
    setInteractionMode: () => {},
    getInteractionMode: unexpectedCall,
    applyOperation: () => {},
    clearPreviews: () => {},
  };
}

type PageWindow = Window & {
  __visionControlContentRuntime?: unknown;
  readonly addEventListener: ReturnType<typeof vi.fn>;
};

function createPageWindow(href: string, mainFrame: boolean): PageWindow {
  const url = new URL(href);
  const pageWindow = {
    location: {
      href: url.href,
      origin: url.origin,
    },
    top: null as Window | null,
    self: null as unknown as Window,
    addEventListener: vi.fn(),
  };
  pageWindow.self = pageWindow as unknown as Window;
  pageWindow.top = mainFrame ? (pageWindow as unknown as Window) : ({} as Window);
  return pageWindow as unknown as PageWindow;
}

function createHarness(options: HarnessOptions | boolean = true): ContentHarness {
  const normalized: HarnessOptions =
    typeof options === "boolean" ? { routeable: options } : options;
  const routeable = normalized.routeable ?? true;
  const href = normalized.href ?? "http://127.0.0.1:5173/";
  const mainFrame = normalized.mainFrame ?? true;

  const bus = createFakeBus();
  const runtime = createFakeRuntime();
  const editHandlers: ContentEditWiring = { dispose: vi.fn() };
  const createBus: ContentEntrypointDependencies["createBus"] = vi.fn(() => bus);
  const createRuntime: ContentEntrypointDependencies["createRuntime"] = vi.fn(() => runtime);
  const wireEditHandlers: ContentEntrypointDependencies["wireEditHandlers"] = vi.fn(
    () => editHandlers,
  );
  const pageWindow = createPageWindow(href, mainFrame);
  let tick = 0;
  const deps: ContentEntrypointDependencies = {
    window: pageWindow,
    document,
    createBus,
    routeableFrame: () => routeable,
    createRuntime,
    wireEditHandlers,
    now: () => {
      tick += 1;
      return tick;
    },
  };
  return {
    bus,
    createBus,
    createRuntime,
    deps,
    editHandlers,
    runtime,
    wireEditHandlers,
    pageWindow,
  };
}

describe("runVisionControlContentScript", () => {
  afterEach(() => {
    delete window.__visionControlContentRuntime;
  });

  it("starts the overlay runtime once when the content script is reinjected", () => {
    // Given: a routeable page where MV3 may execute the content entrypoint twice.
    const harness = createHarness();

    // When: the same isolated-world script runs twice in the same page lifetime.
    runVisionControlContentScript(harness.deps);
    runVisionControlContentScript(harness.deps);

    // Then: the overlay is mounted once, while each execution refreshes frame discovery.
    expect(harness.createBus).toHaveBeenCalledTimes(1);
    expect(harness.createRuntime).toHaveBeenCalledTimes(1);
    expect(harness.runtime.start).toHaveBeenCalledTimes(1);
    expect(harness.wireEditHandlers).toHaveBeenCalledTimes(1);
    expect(harness.bus.sent).toHaveLength(2);
    expect(harness.bus.sent.map((entry) => entry.message.messageType)).toEqual([
      "frame-hello",
      "frame-hello",
    ]);
  });

  it("disposes the sentinel resources on pagehide so a fresh page can start", () => {
    // Given: an active content runtime with overlay wiring installed.
    const harness = createHarness();
    runVisionControlContentScript(harness.deps);

    // When: the browser tears down the document.
    const pagehide = harness.pageWindow.addEventListener.mock.calls.find(
      (call: readonly unknown[]) => call[0] === "pagehide",
    );
    const listener = pagehide?.[1] as (() => void) | undefined;
    expect(listener).toBeTypeOf("function");
    listener?.();

    // Then: resources are disposed and a later execution creates a new runtime.
    expect(harness.editHandlers.dispose).toHaveBeenCalledTimes(1);
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bus.dispose).toHaveBeenCalledTimes(1);
    expect(harness.pageWindow.__visionControlContentRuntime).toBeUndefined();

    runVisionControlContentScript(harness.deps);
    expect(harness.createBus).toHaveBeenCalledTimes(2);
    expect(harness.runtime.start).toHaveBeenCalledTimes(2);
  });

  it("does not start an overlay runtime for an unrouteable frame", () => {
    // Given: a frame that can report presence but must not receive edit routing.
    const harness = createHarness(false);

    // When: the content entrypoint runs in that frame.
    runVisionControlContentScript(harness.deps);

    // Then: it sends frame discovery without mounting edit-capable DOM listeners.
    expect(harness.createBus).toHaveBeenCalledTimes(1);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.runtime.start).not.toHaveBeenCalled();
    expect(harness.wireEditHandlers).not.toHaveBeenCalled();
    expect(harness.bus.sent).toHaveLength(1);
    expect(harness.bus.sent[0]?.message.messageType).toBe("frame-hello");
  });

  it("auto-connects from a loopback /pair page without mounting the overlay", () => {
    // Given: main-frame load of the daemon pair landing page with token params.
    const harness = createHarness({
      href: "http://127.0.0.1:1234/pair?token=abc&port=1234&host=127.0.0.1",
    });

    // When: the content entrypoint runs before any DevTools panel is open.
    runVisionControlContentScript(harness.deps);

    // Then: one daemon-connect is emitted with a parseable vision-control pairing URL.
    expect(harness.createBus).toHaveBeenCalledTimes(1);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.wireEditHandlers).not.toHaveBeenCalled();
    expect(harness.bus.sent).toHaveLength(1);
    const connect = harness.bus.sent[0];
    expect(connect?.route).toBe("background");
    expect(connect?.message.messageType).toBe("daemon-connect");
    const payload = connect?.message.payload as { readonly pairingUrl?: string } | undefined;
    expect(payload?.pairingUrl).toMatch(/^vision-control:\/\//);
    const parsed = parsePairingUrl(payload?.pairingUrl ?? "");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.target).toEqual({ token: "abc", port: 1234, host: "127.0.0.1" });
    }
  });

  it("does not emit daemon-connect when /pair is missing a token", () => {
    // Given: a loopback /pair page without a pairing token.
    const harness = createHarness({
      href: "http://127.0.0.1:1234/pair?port=1234&host=127.0.0.1",
    });

    // When: the content entrypoint runs.
    runVisionControlContentScript(harness.deps);

    // Then: no connect is attempted and the overlay is not mounted.
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.bus.sent.some((entry) => entry.message.messageType === "daemon-connect")).toBe(
      false,
    );
  });

  it("does not auto-connect from a non-pair loopback page", () => {
    // Given: a normal loopback app page (not /pair).
    const harness = createHarness({ href: "http://127.0.0.1:5173/app" });

    // When: the content entrypoint runs.
    runVisionControlContentScript(harness.deps);

    // Then: normal overlay startup occurs with no daemon-connect.
    expect(harness.createRuntime).toHaveBeenCalledTimes(1);
    expect(harness.bus.sent.map((entry) => entry.message.messageType)).toEqual(["frame-hello"]);
  });

  it("does not auto-connect from an iframe even on a pair URL", () => {
    // Given: nested frame navigation that happens to hit /pair.
    const harness = createHarness({
      href: "http://127.0.0.1:1234/pair?token=abc&port=1234&host=127.0.0.1",
      mainFrame: false,
    });

    // When: the content entrypoint runs in that iframe.
    runVisionControlContentScript(harness.deps);

    // Then: no daemon-connect is sent (main-frame only).
    expect(harness.bus.sent.some((entry) => entry.message.messageType === "daemon-connect")).toBe(
      false,
    );
  });
});
