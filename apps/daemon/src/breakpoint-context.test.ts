/**
 * Task 8 — plumb the active breakpoint into daemon compiled agent context
 * (C2 / VC-V1V2-10).
 *
 * Failing-first: the daemon's `compileContext` adapter must derive a
 * `BreakpointContext` from the page-session emission (viewport + active
 * breakpoint resolved by the content runtime in task 7 and stored by
 * `onPageNavigated`) and pass it as the `breakpoint` input so
 * `resolveBreakpoint` emits the breakpoint section in JSON + Markdown. On the
 * baseline (no `breakpoint` wiring) the section is absent and these assertions
 * fail.
 *
 * Adversarial cases:
 * - stale_state: no session entry → section omitted, no error.
 * - misleading_success: a viewport reported without a resolved activeBreakpoint
 *   label must NOT invent a breakpoint (the section stays absent).
 */
import {
  type CompiledContext,
  redactContext,
  renderMarkdown,
} from "@vision-control/context-compiler";
import type { ChangesetService, SourceRegistryService } from "@vision-control/daemon-core";
import { describe, expect, it } from "vitest";
import { createPageSessionStore } from "./business-handlers.js";
import { createDaemonMcpAdapters } from "./mcp-adapters.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

function fakeChangesetService(): ChangesetService {
  return {
    listBySession: () => [{ id: "cs-1", operations_json: "[]" } as never],
  } as unknown as ChangesetService;
}

function fakeSourceRegistryService(): SourceRegistryService {
  return { getBySourceId: () => undefined } as unknown as SourceRegistryService;
}

describe("page-session breakpoint — compiled context (task 8)", () => {
  it("emits a breakpoint section when the session reported an active breakpoint", () => {
    const pageSessionStore = createPageSessionStore();
    pageSessionStore.set("s1", {
      viewport: { width: 1024, height: 768 },
      activeBreakpoint: "lg",
    });

    const adapters = createDaemonMcpAdapters({
      changesetService: fakeChangesetService(),
      sourceRegistryService: fakeSourceRegistryService(),
      pageSessionStore,
      logger: silentLogger as never,
    });

    const compiled = adapters.contextCompiler?.compile({
      sessionId: "s1",
      selection: { elementId: "card", elementTag: "div" },
    }) as CompiledContext | undefined;

    expect(compiled).toBeDefined();
    if (compiled === undefined) return;
    // JSON: breakpoint section present, carrying the resolved viewport label.
    expect(compiled.breakpoint).toBeDefined();
    expect(compiled.breakpoint?.activeViewport).toBe("lg");
    expect(compiled.breakpoint?.responsivePrefix).toBe("lg");
  });

  it("renders the breakpoint section in Markdown context (agent-visible)", () => {
    const pageSessionStore = createPageSessionStore();
    pageSessionStore.set("s1", {
      viewport: { width: 1280, height: 800 },
      activeBreakpoint: "xl",
    });

    const adapters = createDaemonMcpAdapters({
      changesetService: fakeChangesetService(),
      sourceRegistryService: fakeSourceRegistryService(),
      pageSessionStore,
      logger: silentLogger as never,
    });

    const compiled = adapters.contextCompiler?.compile({
      sessionId: "s1",
      selection: { elementId: "card", elementTag: "div" },
    }) as CompiledContext | undefined;

    expect(compiled).toBeDefined();
    if (compiled === undefined) return;
    const markdown = renderMarkdown(redactContext(compiled));
    expect(markdown).toContain("## Breakpoint Context");
    expect(markdown).toContain("**Active viewport:** xl");
  });

  it("omits the breakpoint section when no page session exists (stale state)", () => {
    // No entry for "s2" — the store returns undefined. The compiler must omit
    // the section, not error and not invent a breakpoint.
    const pageSessionStore = createPageSessionStore();

    const adapters = createDaemonMcpAdapters({
      changesetService: fakeChangesetService(),
      sourceRegistryService: fakeSourceRegistryService(),
      pageSessionStore,
      logger: silentLogger as never,
    });

    const compiled = adapters.contextCompiler?.compile({
      sessionId: "s2",
      selection: { elementId: "card", elementTag: "div" },
    }) as CompiledContext | undefined;

    expect(compiled).toBeDefined();
    if (compiled === undefined) return;
    expect(compiled.breakpoint).toBeUndefined();
    const markdown = renderMarkdown(redactContext(compiled));
    expect(markdown).not.toContain("## Breakpoint Context");
  });

  it("omits the breakpoint section when a viewport is reported but no breakpoint label (no invention)", () => {
    // Adversarial misleading-success: a viewport dimension arrived but the
    // content runtime never resolved a breakpoint label (e.g. matchMedia
    // unavailable). The daemon must NOT fabricate a label from the width — it
    // passes undefined and the compiler omits the section.
    const pageSessionStore = createPageSessionStore();
    pageSessionStore.set("s1", { viewport: { width: 768, height: 500 } });

    const adapters = createDaemonMcpAdapters({
      changesetService: fakeChangesetService(),
      sourceRegistryService: fakeSourceRegistryService(),
      pageSessionStore,
      logger: silentLogger as never,
    });

    const compiled = adapters.contextCompiler?.compile({
      sessionId: "s1",
      selection: { elementId: "card", elementTag: "div" },
    }) as CompiledContext | undefined;

    expect(compiled).toBeDefined();
    if (compiled === undefined) return;
    expect(compiled.breakpoint).toBeUndefined();
  });

  it("omits the breakpoint section when no pageSessionStore is wired into the adapter", () => {
    // Adapter constructed without a pageSessionStore (e.g. daemon runs without
    // the MCP port). Must degrade honestly — no breakpoint section.
    const adapters = createDaemonMcpAdapters({
      changesetService: fakeChangesetService(),
      sourceRegistryService: fakeSourceRegistryService(),
      logger: silentLogger as never,
    });

    const compiled = adapters.contextCompiler?.compile({
      sessionId: "s1",
      selection: { elementId: "card", elementTag: "div" },
    }) as CompiledContext | undefined;

    expect(compiled).toBeDefined();
    if (compiled === undefined) return;
    expect(compiled.breakpoint).toBeUndefined();
  });
});
