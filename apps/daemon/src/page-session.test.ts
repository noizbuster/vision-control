import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type BusinessHandlerDeps,
  createBusinessHandlers,
  createPageSessionStore,
} from "./business-handlers.js";
import { discoverTailwindScreens } from "./workspace-discovery.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const noopAudit = { insert: () => undefined } as unknown as BusinessHandlerDeps["auditRepo"];
const noopChangeset = {
  persist: () => undefined,
  latest: () => [],
} as unknown as BusinessHandlerDeps["changesetService"];

function makeDeps(overrides?: Partial<BusinessHandlerDeps>): BusinessHandlerDeps {
  return {
    workspaceId: "ws-test",
    getActiveSessionId: () => "sess-test",
    auditRepo: noopAudit,
    logger: silentLogger as never,
    changesetService: noopChangeset,
    sourcePipeline: {} as BusinessHandlerDeps["sourcePipeline"],
    selectionStore: { get: () => undefined, set: () => undefined, clear: () => undefined },
    pageSessionStore: createPageSessionStore(),
    ...overrides,
  };
}

describe("createPageSessionStore", () => {
  it("stores and retrieves viewport + active breakpoint by sessionId", () => {
    const store = createPageSessionStore();
    store.set("s1", { viewport: { width: 1024, height: 768 }, activeBreakpoint: "lg" });
    expect(store.get("s1")).toEqual({
      viewport: { width: 1024, height: 768 },
      activeBreakpoint: "lg",
    });
  });

  it("clears a session entry", () => {
    const store = createPageSessionStore();
    store.set("s1", { activeBreakpoint: "md" });
    store.clear("s1");
    expect(store.get("s1")).toBeUndefined();
  });
});

describe("onPageNavigated stores viewport + activeBreakpoint (plan task 7)", () => {
  it("persists viewport and activeBreakpoint from a page.navigated payload", () => {
    const pageSessionStore = createPageSessionStore();
    const handlers = createBusinessHandlers(makeDeps({ pageSessionStore }));

    handlers.onPageNavigated(
      {
        type: "page.navigated",
        url: "http://localhost:3000/",
        title: "App",
        framePath: [],
        viewport: { width: 1280, height: 800 },
        activeBreakpoint: "xl",
      },
      {} as never,
    );

    expect(pageSessionStore.get("sess-test")).toEqual({
      viewport: { width: 1280, height: 800 },
      activeBreakpoint: "xl",
    });
  });

  it("stores an entry with no viewport/breakpoint when the payload omits them", () => {
    const pageSessionStore = createPageSessionStore();
    const handlers = createBusinessHandlers(makeDeps({ pageSessionStore }));

    handlers.onPageNavigated(
      { type: "page.navigated", url: "http://localhost:3000/", title: "App", framePath: [] },
      {} as never,
    );

    expect(pageSessionStore.get("sess-test")).toBeDefined();
    expect(pageSessionStore.get("sess-test")?.activeBreakpoint).toBeUndefined();
  });

  it("skips storage when no active session", () => {
    const pageSessionStore = createPageSessionStore();
    const handlers = createBusinessHandlers(
      makeDeps({ pageSessionStore, getActiveSessionId: () => undefined }),
    );

    handlers.onPageNavigated(
      {
        type: "page.navigated",
        url: "http://localhost:3000/",
        title: "App",
        framePath: [],
        activeBreakpoint: "md",
      },
      {} as never,
    );

    expect(pageSessionStore.get("sess-test")).toBeUndefined();
  });
});

describe("discoverTailwindScreens", () => {
  it("extracts theme.screens names from a v3 config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-screens-"));
    try {
      writeFileSync(
        join(dir, "tailwind.config.js"),
        'module.exports = { theme: { screens: { sm: "640px", md: "768px", custom: "900px" } } };\n',
      );
      const screens = await discoverTailwindScreens(dir);
      expect(screens).toEqual(["sm", "md", "custom"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extracts legacy top-level screens", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-screens-legacy-"));
    try {
      writeFileSync(
        join(dir, "tailwind.config.js"),
        'module.exports = { screens: { sm: "640px", lg: "1024px" } };\n',
      );
      const screens = await discoverTailwindScreens(dir);
      expect(screens).toEqual(["sm", "lg"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns undefined when no config present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-screens-none-"));
    try {
      const screens = await discoverTailwindScreens(dir);
      expect(screens).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
