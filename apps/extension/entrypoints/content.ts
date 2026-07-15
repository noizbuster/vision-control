import { synthesizePairingUrlFromHttpPairPage } from "@vision-control/bridge-client";
import type { ContentScriptDefinition } from "wxt";
import { defineContentScript } from "wxt/utils/define-content-script";
import { createBridgeConnectMessage, createRuntimeBus } from "../src/messaging/index.js";
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
import type { ContentCommandWiring } from "../src/verification/content-command-wiring.js";
import { wireContentCommandHandlers } from "../src/verification/content-command-wiring.js";

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
  readonly commandHandlers: ContentCommandWiring | null;
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

function isMainFrame(win: Window): boolean {
  return win.top === win.self;
}

function isLoopbackHttpPairPage(href: string): boolean {
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.startsWith("[")
      ? parsed.hostname.slice(1, -1)
      : parsed.hostname;
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      return false;
    }
    return parsed.pathname === "/pair";
  } catch (error) {
    if (error instanceof TypeError) {
      return false;
    }
    throw error;
  }
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

function installContentRuntimeSlot(
  deps: ContentEntrypointDependencies,
  slot: ContentRuntimeSlot,
): void {
  deps.window.__visionControlContentRuntime = slot;
  deps.window.addEventListener(
    "pagehide",
    () => {
      slot.commandHandlers?.dispose();
      slot.editHandlers?.dispose();
      slot.runtime?.dispose();
      slot.bus.dispose();
      delete deps.window.__visionControlContentRuntime;
    },
    { once: true },
  );
}

function stripPairingTokenFromAddressBar(win: Window): void {
  let parsed: URL;
  try {
    parsed = new URL(win.location.href);
  } catch (error) {
    if (error instanceof TypeError) {
      return;
    }
    throw error;
  }
  if (!parsed.searchParams.has("token")) {
    return;
  }
  parsed.searchParams.delete("token");
  const next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  win.history.replaceState(win.history.state, "", next);
}

function setPairPageConnectedTitle(doc: Document): void {
  doc.title = "Vision Control Connected";
}

function tryAutoPairFromPairPage(
  deps: ContentEntrypointDependencies,
  bus: ContentEntrypointBus,
): boolean {
  if (!isMainFrame(deps.window)) {
    return false;
  }
  const href = deps.window.location.href;
  const synthesized = synthesizePairingUrlFromHttpPairPage(href);
  if (synthesized.success) {
    installContentRuntimeSlot(deps, {
      bus,
      runtime: null,
      editHandlers: null,
      commandHandlers: null,
    });
    bus.send("background", createBridgeConnectMessage(synthesized.pairingUrl));
    stripPairingTokenFromAddressBar(deps.window);
    setPairPageConnectedTitle(deps.document);
    return true;
  }
  if (isLoopbackHttpPairPage(href)) {
    installContentRuntimeSlot(deps, {
      bus,
      runtime: null,
      editHandlers: null,
      commandHandlers: null,
    });
    return true;
  }
  return false;
}

export function runVisionControlContentScript(deps = createDefaultDependencies()): void {
  const existing = deps.window.__visionControlContentRuntime;
  if (existing !== undefined) {
    sendFrameHello(deps, existing.bus);
    return;
  }

  const bus = deps.createBus("content");
  if (tryAutoPairFromPairPage(deps, bus)) {
    return;
  }

  let runtime: OverlayRuntime | null = null;
  let editHandlers: ContentEditWiring | null = null;
  let commandHandlers: ContentCommandWiring | null = null;
  if (deps.routeableFrame(deps.window)) {
    runtime = deps.createRuntime({ document: deps.document, bus });
    runtime.start();
    editHandlers = deps.wireEditHandlers(bus, runtime);
    commandHandlers = wireContentCommandHandlers({
      bus,
      preview: runtime.getPreviewClearer(),
    });
  }

  installContentRuntimeSlot(deps, { bus, runtime, editHandlers, commandHandlers });
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
