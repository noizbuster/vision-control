import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangesetService, SourceRegistryService } from "@vision-control/daemon-core";
import { createSourceEntry } from "@vision-control/source-registry";
import type { SourceAdapter, SourceCandidate } from "@vision-control/source-resolver";
import { describe, expect, it } from "vitest";
import { createDaemonMcpAdapters } from "./mcp-adapters.js";
import { buildSourcePipeline, resolveSourceRequest } from "./source-pipeline.js";

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-pipeline-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "Button.tsx"),
    'export function Button() { return <button className="btn">Click</button>; }\n',
  );
  return dir;
}

function markerEntry(sourceId: string, fingerprint: string) {
  return createSourceEntry({
    sourceId,
    workspaceRelativePath: "src/Button.tsx",
    range: { startLine: 0, startColumn: 9, endLine: 0, endColumn: 16 },
    componentName: "Button",
    fingerprint,
  });
}

describe("source pipeline — marker resolution cascade", () => {
  it("resolves a marker-bearing element to HIGH (source-candidate.ts:96-104 enforces honesty)", async () => {
    const workspace = makeWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        initialEntries: [markerEntry("marker-high-1", "fp-stable")],
        logger: silentLogger as never,
      });
      const resolved = resolveSourceRequest(pipeline.resolver, pipeline.registry, "marker-high-1");
      expect(resolved.confidence).toBe("high");
      expect(resolved.sourceToken).toBe("marker-high-1");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("falls back to LOW for an element with no registered marker (never a false HIGH)", async () => {
    const workspace = makeWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const resolved = resolveSourceRequest(pipeline.resolver, pipeline.registry, "unknown-elem-1");
      expect(resolved.confidence).not.toBe("high");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

function makeV4Workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "vc-v4-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "app.css"),
    [
      '@import "tailwindcss";',
      "@theme {",
      "  --color-brand: oklch(0.5 0.2 250);",
      "  --spacing-2: 0.5rem;",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "src", "Card.tsx"),
    'export function Card() { return <div className="bg-brand">Hi</div>; }\n',
  );
  return dir;
}

describe("source pipeline — Tailwind v4 @theme detection (task 12)", () => {
  it("detects a v4 workspace (no config + @theme) and resolves a v4 custom token", async () => {
    const workspace = makeV4Workspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const candidates = pipeline.resolver.resolveCandidates(
        {
          runtimeId: "card",
          tagName: "div",
          frameId: "main",
          fingerprint: "fp",
          confidence: "high",
        },
        { cssClasses: ["bg-brand"], runtimeInstanceCount: 1 },
      );
      const tailwind = candidates.find(
        (c) => c.staticClassName === "bg-brand" && c.evidence?.includes("ast-origin"),
      );
      expect(tailwind).toBeDefined();
      expect(tailwind?.confidence).toBe("high");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("a v4 registry-only candidate (no source origin) stays <= MEDIUM", async () => {
    const workspace = makeV4Workspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      // bg-brand exists in CSS but NOT in the tsx source as a static literal.
      const candidates = pipeline.resolver.resolveCandidates(
        {
          runtimeId: "dyn",
          tagName: "div",
          frameId: "main",
          fingerprint: "fp",
          confidence: "high",
        },
        { cssClasses: ["via-brand"], runtimeInstanceCount: 1 },
      );
      const viaBrand = candidates.find((c) => c.staticClassName === "via-brand");
      if (viaBrand !== undefined) {
        expect(viaBrand.confidence).not.toBe("high");
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("source pipeline — never-wrong-HIGH adversarial (R7 binding)", () => {
  it("downgrades a lying adapter claiming HIGH with only text-search evidence to MEDIUM", async () => {
    const workspace = makeWorkspace();
    try {
      const lyingAdapter: SourceAdapter = {
        id: "lying-adapter",
        description: "claims HIGH with weak evidence",
        resolve: (): readonly SourceCandidate[] => [
          {
            confidence: "high",
            warnings: [],
            workspaceRelativePath: "src/Button.tsx",
            evidence: ["text-search"],
          },
        ],
      };
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      pipeline.adapterRegistry.register(lyingAdapter);

      const candidates = pipeline.resolver.resolveCandidates({
        runtimeId: "lying-elem",
        tagName: "button",
        frameId: "main",
        fingerprint: "fp",
        confidence: "high",
      });
      const lying = candidates.find((c) => c.workspaceRelativePath === "src/Button.tsx");
      expect(lying).toBeDefined();
      if (lying === undefined) return;
      // enforceNeverWrongHigh downgraded the false HIGH to MEDIUM + warning.
      expect(lying.confidence).toBe("medium");
      expect(lying.warnings.some((w) => w.includes("never-wrong-HIGH"))).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("never produces a false HIGH even when an adapter omits evidence entirely", async () => {
    const workspace = makeWorkspace();
    try {
      const noEvidenceAdapter: SourceAdapter = {
        id: "no-evidence",
        resolve: (): readonly SourceCandidate[] => [
          { confidence: "high", warnings: [], evidence: [] },
        ],
      };
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      pipeline.adapterRegistry.register(noEvidenceAdapter);

      const candidates = pipeline.resolver.resolveCandidates({
        runtimeId: "e",
        tagName: "div",
        frameId: "main",
        fingerprint: "fp",
        confidence: "high",
      });
      const top = candidates[0];
      expect(top).toBeDefined();
      if (top === undefined) return;
      expect(top.confidence).not.toBe("high");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe("MCP adapters — real verification plan (not STUB)", () => {
  function fakeChangesetService(operationsJson: string): ChangesetService {
    return {
      listBySession: () => [{ id: "cs-1", operations_json: operationsJson } as never],
    } as unknown as ChangesetService;
  }

  function fakeSourceRegistryService(): SourceRegistryService {
    return { getBySourceId: () => undefined } as unknown as SourceRegistryService;
  }

  it("verificationCoordinator.getPlan returns a real plan derived from the changeset", async () => {
    const workspace = makeWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const ops = JSON.stringify([
        {
          kind: "style-edit",
          property: "color",
          value: "red",
          origin: "property-panel",
          confidence: 1,
          target: { runtimeId: "r", tagName: "div" },
        },
      ]);
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(ops),
        sourceRegistryService: fakeSourceRegistryService(),
        resolver: pipeline.resolver,
        registry: pipeline.registry,
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const plan = await adapters.verificationCoordinator?.getPlan?.({ sessionId: "s1" });
      expect(plan).toBeDefined();
      if (plan === undefined) return;
      expect(plan.notes).not.toContain("STUB");
      expect(plan.assertions.length).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("contextCompiler.compile injects a real verificationPlan (never the empty-assertions stub)", async () => {
    const workspace = makeWorkspace();
    try {
      const pipeline = await buildSourcePipeline({
        workspaceRoot: workspace,
        initialEntries: [markerEntry("marker-ctx", "fp")],
        logger: silentLogger as never,
      });
      const ops = JSON.stringify([
        {
          kind: "class-add",
          className: "on",
          origin: "property-panel",
          confidence: 1,
          target: { runtimeId: "r", tagName: "div" },
        },
      ]);
      const adapters = createDaemonMcpAdapters({
        changesetService: fakeChangesetService(ops),
        sourceRegistryService: fakeSourceRegistryService(),
        resolver: pipeline.resolver,
        registry: pipeline.registry,
        workspaceRoot: workspace,
        logger: silentLogger as never,
      });
      const compiled = adapters.contextCompiler?.compile({
        sessionId: "s1",
        selection: { elementId: "marker-ctx", elementTag: "div", sourceId: "marker-ctx" },
      }) as
        | { verificationPlan: { notes: string; assertions: { description: string }[] } }
        | undefined;
      expect(compiled).toBeDefined();
      if (compiled === undefined) return;
      expect(compiled.verificationPlan.notes).not.toContain(
        "will be generated by the verification engine",
      );
      expect(compiled.verificationPlan.assertions.length).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
