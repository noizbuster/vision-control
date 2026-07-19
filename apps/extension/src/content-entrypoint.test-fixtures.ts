import type { PreviewManager } from "@vision-control/preview-engine";
import { vi } from "vitest";

import type {
  ContentEntrypointBus,
  ContentEntrypointDependencies,
} from "../entrypoints/content.js";
import type { BusRoute } from "./messaging/index.js";
import type { ContentEditWiring } from "./overlay/content-edit-wiring.js";
import type { OverlayRuntime } from "./overlay/overlay-runtime.js";

type SentMessage = {
  readonly route: BusRoute;
  readonly message: Parameters<ContentEntrypointBus["send"]>[1];
};

type FakeBus = ContentEntrypointBus & { readonly sent: SentMessage[] };

type HarnessOptions = {
  readonly routeable?: boolean;
  readonly href?: string;
  readonly mainFrame?: boolean;
};

type MutableLocation = { href: string; origin: string };

type FakeHistory = {
  state: unknown;
  replaceState: ReturnType<
    typeof vi.fn<(state: unknown, title: string, nextUrl?: string | URL | null) => void>
  >;
};

export type PageWindow = Window & {
  __visionControlContentRuntime?: unknown;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly location: MutableLocation;
  readonly history: FakeHistory;
};

export type ContentHarness = {
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
    send: (route, message) => sent.push({ route, message }),
    on: () => () => {},
    dispose: vi.fn(),
  };
}

function createFakeRuntime(): OverlayRuntime {
  const previewManager: PreviewManager = Object.create(null);
  Object.defineProperties(previewManager, {
    activeCount: { value: 0 },
    clearAll: { value: () => {} },
  });
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
    getPreviewClearer: () => previewManager,
  };
}

function createPageWindow(href: string, mainFrame: boolean): PageWindow {
  const url = new URL(href);
  const location: MutableLocation = { href: url.href, origin: url.origin };
  const history: FakeHistory = {
    state: null,
    replaceState: vi.fn((state, _title, nextUrl) => {
      history.state = state;
      if (typeof nextUrl === "string" && nextUrl.length > 0) {
        location.href = new URL(nextUrl, location.href).href;
      } else if (nextUrl instanceof URL) {
        location.href = nextUrl.href;
      }
    }),
  };
  const pageWindow: PageWindow = Object.create(window);
  Object.defineProperties(pageWindow, {
    location: { configurable: true, value: location },
    history: { configurable: true, value: history },
    addEventListener: { configurable: true, value: vi.fn() },
    self: { configurable: true, value: pageWindow },
    top: {
      configurable: true,
      value: mainFrame ? pageWindow : Object.create(window),
    },
  });
  return pageWindow;
}

export function createContentHarness(options: HarnessOptions | boolean = true): ContentHarness {
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
