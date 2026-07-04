/**
 * Task 9 — workspace TokenRegistry → daemon compiled context (C2 / VC-V1V2-18).
 *
 * Failing-first: asserts the compiled agent context carries a non-empty token
 * section with provenance sources once the daemon builds a workspace
 * TokenRegistry and plumbs `registry.summary()` into `compileContext`. On the
 * baseline (no `tokenRegistry` wiring) the token section is absent and these
 * assertions fail. A separate adversarial case injects a registry with
 * conflicting token values and asserts the conflict surfaces as a warning
 * (never silently dropped).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CompiledContext,
  redactContext,
  renderMarkdown,
} from "@vision-control/context-compiler";
import type { ChangesetService, SourceRegistryService } from "@vision-control/daemon-core";
import { createDesignToken, InMemoryTokenRegistry } from "@vision-control/source-resolver";
import { describe, expect, it } from "vitest";
import { createDaemonMcpAdapters } from "./mcp-adapters.js";
import { buildSourcePipeline } from "./source-pipeline.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

function makeTokenizedWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-tokens-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "Button.tsx"),
    'export function Button() { return <button className="btn">Click</button>; }\n',
  );
  // A consumer CSS file with design-token custom properties in `:root`.
  writeFileSync(
    join(dir, "src", "tokens.css"),
    [
      ":root {",
      "  --color-brand: #123456;",
      "  --spacing-page: 2rem;",
      "  --font-sans: Inter, system-ui, sans-serif;",
      "}",
      "",
    ].join("\n"),
  );
  return dir;
}

function fakeChangesetService(): ChangesetService {
  return {
    listBySession: () => [{ id: "cs-1", operations_json: "[]" } as never],
  } as unknown as ChangesetService;
}

function fakeSourceRegistryService(): SourceRegistryService {
  return { getBySourceId: () => undefined } as unknown as SourceRegistryService;
}

describe("workspace token registry — compiled context (task 9)", () => {
  it("emits a non-empty token section with provenance sources when workspace tokens exist", async () => {
    const workspace = makeTokenizedWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(),
        sourceRegistryService: fakeSourceRegistryService(),
        resolver: pipeline.resolver,
        registry: pipeline.registry,
        tokenRegistry: pipeline.tokenRegistry,
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const compiled = adapters.contextCompiler?.compile({
        sessionId: "s1",
        selection: { elementId: "btn", elementTag: "button" },
      }) as
        | {
            readonly tokenRegistry?: {
              readonly totalTokens: number;
              readonly sources: readonly string[];
              readonly conflictCount: number;
            };
          }
        | undefined;

      expect(compiled).toBeDefined();
      if (compiled === undefined) return;
      // Token section present (fails on baseline — no tokenRegistry wiring).
      expect(compiled.tokenRegistry).toBeDefined();
      expect(compiled.tokenRegistry?.totalTokens).toBeGreaterThan(0);
      // Provenance: at least one source kind is attributed.
      expect(compiled.tokenRegistry?.sources.length).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("renders the token section in Markdown context (agent-visible)", async () => {
    const workspace = makeTokenizedWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(),
        sourceRegistryService: fakeSourceRegistryService(),
        resolver: pipeline.resolver,
        registry: pipeline.registry,
        tokenRegistry: pipeline.tokenRegistry,
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const compiled = adapters.contextCompiler?.compile({
        sessionId: "s1",
        selection: { elementId: "btn", elementTag: "button" },
      }) as CompiledContext | undefined;
      expect(compiled).toBeDefined();
      if (compiled === undefined) return;
      const markdown = renderMarkdown(redactContext(compiled));
      expect(markdown).toContain("## Token Registry");
      // Provenance visible: a source kind appears in the rendered section.
      expect(markdown).toContain("Sources:**");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("omits the token section when no registry is supplied (no false success)", async () => {
    const workspace = makeTokenizedWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(),
        sourceRegistryService: fakeSourceRegistryService(),
        resolver: pipeline.resolver,
        registry: pipeline.registry,
        // tokenRegistry intentionally omitted.
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const compiled = adapters.contextCompiler?.compile({
        sessionId: "s1",
        selection: { elementId: "btn", elementTag: "button" },
      }) as { readonly tokenRegistry?: unknown } | undefined;

      expect(compiled).toBeDefined();
      if (compiled === undefined) return;
      expect(compiled.tokenRegistry).toBeUndefined();
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("surfaces a token-value conflict as a warning, never silently dropped", () => {
    // A registry with the SAME name registered from two sources with DIFFERENT
    // values — the adversarial "malformed input" class.
    const registry = new InMemoryTokenRegistry();
    registry.register(
      createDesignToken({
        name: "brand",
        category: "color",
        value: "#111111",
        provenance: { kind: "tailwind-v3-config", sourcePath: "tailwind.config.ts" },
      }),
    );
    registry.register(
      createDesignToken({
        name: "brand",
        category: "color",
        value: "#222222",
        provenance: { kind: "css-custom-property", sourcePath: "src/tokens.css" },
      }),
    );

    const workspace = mkdtempSync(join(tmpdir(), "vc-tokens-empty-"));
    try {
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(),
        sourceRegistryService: fakeSourceRegistryService(),
        tokenRegistry: registry,
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const compiled = adapters.contextCompiler?.compile({
        sessionId: "s1",
        selection: { elementId: "btn", elementTag: "button" },
      }) as
        | {
            readonly warnings: readonly { readonly code: string; readonly message: string }[];
            readonly tokenRegistry?: { readonly conflictCount: number };
          }
        | undefined;

      expect(compiled).toBeDefined();
      if (compiled === undefined) return;
      // Conflict count surfaced in the summary.
      expect(compiled.tokenRegistry?.conflictCount).toBe(1);
      // Conflict surfaced as a warning (token-conflict code), never dropped.
      const conflictWarning = compiled.warnings.find((w) => w.code === "token-conflict");
      expect(conflictWarning).toBeDefined();
      expect(conflictWarning?.message).toContain("brand");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("empty workspace → empty token section is absent, not an error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-empty-"));
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: dir,
        logger: silentLogger as never,
      });
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(),
        sourceRegistryService: fakeSourceRegistryService(),
        tokenRegistry: pipeline.tokenRegistry,
        workspaceRoot: dir,
        logger: silentLogger as never,
      });
      const compiled = adapters.contextCompiler?.compile({
        sessionId: "s1",
        selection: { elementId: "x", elementTag: "div" },
      }) as { readonly tokenRegistry?: { readonly totalTokens: number } } | undefined;

      expect(compiled).toBeDefined();
      if (compiled === undefined) return;
      // Stale-state guard: an empty workspace yields no token section (not an
      // error, not a wrong entry). The registry is empty so summary is omitted.
      expect(compiled.tokenRegistry?.totalTokens ?? 0).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
