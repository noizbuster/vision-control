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
  readonly sent: readonly SentMessage[];
};

type ContentHarness = {
  readonly bus: FakeBus;
  readonly createBus: ContentEntrypointDependencies["createBus"];
  readonly createRuntime: ContentEntrypointDependencies["createRuntime"];
  readonly deps: ContentEntrypointDependencies;
  readonly editHandlers: ContentEditWiring;
  readonly runtime: OverlayRuntime;
  readonly wireEditHandlers: ContentEntrypointDependencies["wireEditHandlers"];
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

function createHarness(routeable = true): ContentHarness {
  const bus = createFakeBus();
  const runtime = createFakeRuntime();
  const editHandlers: ContentEditWiring = { dispose: vi.fn() };
  const createBus: ContentEntrypointDependencies["createBus"] = vi.fn(() => bus);
  const createRuntime: ContentEntrypointDependencies["createRuntime"] = vi.fn(() => runtime);
  const wireEditHandlers: ContentEntrypointDependencies["wireEditHandlers"] = vi.fn(
    () => editHandlers,
  );
  let tick = 0;
  const deps: ContentEntrypointDependencies = {
    window,
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
  return { bus, createBus, createRuntime, deps, editHandlers, runtime, wireEditHandlers };
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
    window.dispatchEvent(new Event("pagehide"));

    // Then: resources are disposed and a later execution creates a new runtime.
    expect(harness.editHandlers.dispose).toHaveBeenCalledTimes(1);
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bus.dispose).toHaveBeenCalledTimes(1);
    expect(window.__visionControlContentRuntime).toBeUndefined();

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
});
