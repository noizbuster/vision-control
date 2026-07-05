import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createRuntimeBus } from "../src/messaging/index.js";
import {
  type ContentEditWiring,
  wireContentEditHandlers,
} from "../src/overlay/content-edit-wiring.js";
import {
  createOverlayRuntime,
  isRouteableFrame,
  type OverlayRuntime,
  type OverlayRuntimeBus,
} from "../src/overlay/overlay-runtime.js";

const LOOPBACK_MATCHES = ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"] as const;

export interface ContentEntrypointBus extends OverlayRuntimeBus {
  readonly dispose: () => void;
}

export interface ContentEntrypointDependencies {
  readonly window: Window;
  readonly document: Document;
  readonly createBus: (route: "content") => ContentEntrypointBus;
  readonly routeableFrame: (window: Window) => boolean;
  readonly createRuntime: (options: {
    readonly document: Document;
    readonly bus: OverlayRuntimeBus;
  }) => OverlayRuntime;
  readonly wireEditHandlers: (bus: OverlayRuntimeBus, runtime: OverlayRuntime) => ContentEditWiring;
  readonly now: () => number;
}

interface ContentRuntimeSlot {
  readonly bus: ContentEntrypointBus;
  readonly runtime: OverlayRuntime | null;
  readonly editHandlers: ContentEditWiring | null;
}

declare global {
  interface Window {
    __visionControlContentRuntime?: ContentRuntimeSlot;
  }
}

function createDefaultDependencies(): ContentEntrypointDependencies {
  return {
    window,
    document,
    createBus: createRuntimeBus,
    routeableFrame: isRouteableFrame,
    createRuntime: createOverlayRuntime,
    wireEditHandlers: wireContentEditHandlers,
    now: Date.now,
  };
}

function sendFrameHello(deps: ContentEntrypointDependencies, bus: ContentEntrypointBus): void {
  bus.send("background", {
    protocolVersion: "1.0.0",
    messageId: `frame-hello-${deps.now()}`,
    messageType: "frame-hello",
    payload: {
      url: deps.window.location.href,
      origin: deps.window.location.origin,
    },
    timestamp: deps.now(),
  });
}

export function runVisionControlContentScript(deps = createDefaultDependencies()): void {
  const existing = deps.window.__visionControlContentRuntime;
  if (existing !== undefined) {
    sendFrameHello(deps, existing.bus);
    return;
  }

  const bus = deps.createBus("content");
  let runtime: OverlayRuntime | null = null;
  let editHandlers: ContentEditWiring | null = null;
  if (deps.routeableFrame(deps.window)) {
    runtime = deps.createRuntime({ document: deps.document, bus });
    runtime.start();
    editHandlers = deps.wireEditHandlers(bus, runtime);
  }

  deps.window.__visionControlContentRuntime = { bus, runtime, editHandlers };
  deps.window.addEventListener(
    "pagehide",
    () => {
      editHandlers?.dispose();
      runtime?.dispose();
      bus.dispose();
      delete deps.window.__visionControlContentRuntime;
    },
    { once: true },
  );

  sendFrameHello(deps, bus);
}

const contentScript: ContentScriptDefinition = defineContentScript({
  matches: [...LOOPBACK_MATCHES],
  world: "ISOLATED",

  main() {
    runVisionControlContentScript();
  },
});

export default contentScript;
