import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { OperationSummary, TargetSummary } from "./context-schema.js";
import {
  type CompileSnapshotInputs,
  compileVisionContextSnapshot,
} from "./snapshot-compiler.js";
import {
  SNAPSHOT_FORMAT_VERSION,
  VisionContextSnapshotSchema,
} from "./snapshot-schema.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const makeSelection = (): TargetSummary => ({
  identity: {
    runtimeId: "runtime-0001",
    sourceId: "src-btn-0001",
    fingerprint: "abcdef12",
    confidence: "medium",
    selectors: ["button.primary"],
  },
  semantic: {
    tagName: "button",
    role: "button",
    name: "Submit",
    textContentPreview: "Submit",
  },
  breadcrumb: [
    { tagName: "html" },
    { tagName: "body" },
    { tagName: "button", className: "primary", selector: "button.primary" },
  ],
  computedStyle: { color: "white", display: "inline-block" },
  boxModel: {
    contentWidth: 120,
    contentHeight: 40,
    positionX: 100,
    positionY: 200,
  },
  classList: [{ name: "primary", source: "css" }],
  attributes: [{ name: "type", value: "submit" }],
});

const makeOperation = (): OperationSummary => ({
  id: "op-style0001",
  kind: "style-edit",
  runtime: false,
  description: "Set color to red",
  target: "button.primary",
  detail: { property: "color", value: "red" },
});

const makeInputs = (overrides?: Partial<CompileSnapshotInputs>): CompileSnapshotInputs => ({
  snapshotRev: 1,
  compiledAt: 1_700_000_000_000,
  selection: makeSelection(),
  operations: [makeOperation()],
  journal: {
    entryCount: 1,
    canUndo: true,
    canRedo: false,
    undoDepth: 1,
    redoDepth: 0,
    recentKinds: ["style-edit"],
  },
  ...overrides,
});

describe("VisionContextSnapshot portable schema", () => {
  it("compiles a schema-valid snapshot from pure data without workspaceRoot", () => {
    const snapshot = compileVisionContextSnapshot(makeInputs());
    const result = VisionContextSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    expect(snapshot.formatVersion).toBe(SNAPSHOT_FORMAT_VERSION);
    expect(snapshot.snapshotRev).toBe(1);
    expect(snapshot.selection?.identity.sourceId).toBe("src-btn-0001");
    expect(snapshot.operations).toHaveLength(1);
    expect(snapshot.journal.entryCount).toBe(1);
    expect(snapshot.privacyReport.totalRedacted).toBe(0);
    // Pure-data contract: no workspace root field on the snapshot.
    expect("workspaceRoot" in snapshot).toBe(false);
  });

  it("accepts empty origins as valid (ADR-019)", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        origins: [],
        originsTruncated: false,
      }),
    );
    const result = VisionContextSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);
    expect(snapshot.origins).toEqual([]);
    expect(snapshot.originsTruncated).toBe(false);
  });

  it("defaults origins to empty and originsTruncated to false when omitted", () => {
    const snapshot = compileVisionContextSnapshot({
      snapshotRev: 0,
      compiledAt: 1,
    });
    expect(snapshot.origins).toEqual([]);
    expect(snapshot.originsTruncated).toBe(false);
    expect(snapshot.operations).toEqual([]);
    expect(snapshot.journal.entryCount).toBe(0);
    expect(snapshot.selection).toBeUndefined();
    expect(VisionContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("preserves origins and originsTruncated when map caps skip remainder", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        origins: [
          {
            relativePath: "src/Button.tsx",
            sourceUrl: "http://localhost:5173/src/Button.tsx",
            startLine: 10,
            endLine: 12,
            confidence: "high",
            kind: "js",
            warnings: [],
          },
        ],
        originsTruncated: true,
        confidence: "high",
        sourceConfidenceDetail: {
          method: "source-map",
          reasons: ["map+range"],
          warnings: [],
        },
      }),
    );
    expect(snapshot.origins).toHaveLength(1);
    expect(snapshot.origins[0]?.relativePath).toBe("src/Button.tsx");
    expect(snapshot.originsTruncated).toBe(true);
    expect(snapshot.confidence).toBe("high");
    expect(snapshot.sourceConfidenceDetail?.method).toBe("source-map");
    expect(VisionContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("carries monotonic snapshotRev and optional tab/session ids", () => {
    const first = compileVisionContextSnapshot(
      makeInputs({ snapshotRev: 3, tabId: "tab-9", sessionId: "sess-1" }),
    );
    const second = compileVisionContextSnapshot(
      makeInputs({ snapshotRev: 4, tabId: "tab-9", sessionId: "sess-1" }),
    );
    expect(first.snapshotRev).toBe(3);
    expect(second.snapshotRev).toBe(4);
    expect(second.snapshotRev).toBeGreaterThan(first.snapshotRev);
    expect(second.tabId).toBe("tab-9");
    expect(second.sessionId).toBe("sess-1");
  });

  it("does not require absolute machine paths on origins", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        origins: [
          {
            relativePath: "components/Card.module.css",
            confidence: "medium",
            kind: "css",
            warnings: [],
          },
        ],
      }),
    );
    const origin = snapshot.origins[0];
    expect(origin?.relativePath).toBe("components/Card.module.css");
    expect(origin && "workspaceRoot" in origin).toBe(false);
    expect(origin && "absolutePath" in origin).toBe(false);
  });

  it("does not mutate caller-supplied origins or operations arrays", () => {
    const origins = [
      {
        relativePath: "a.ts",
        confidence: "low" as const,
        warnings: ["stale"],
      },
    ];
    const operations = [makeOperation()];
    const snapshot = compileVisionContextSnapshot(makeInputs({ origins, operations }));
    origins[0]!.warnings.push("mutated");
    operations.push({
      id: "op-extra",
      kind: "text-edit",
      runtime: false,
      description: "extra",
      detail: {},
    });
    expect(snapshot.origins[0]?.warnings).toEqual(["stale"]);
    expect(snapshot.operations).toHaveLength(1);
  });

  it("keeps runtime package.json free of platform:node source packages", () => {
    const raw = readFileSync(join(packageRoot, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const runtimeDeps = Object.keys(pkg.dependencies ?? {});
    // Known platform:node packages in this monorepo must not be runtime deps.
    const nodeOnly = [
      "@vision-control/daemon-core",
      "@vision-control/storage",
      "@vision-control/workspace-index",
      "@vision-control/cli",
      "@vision-control/mcp-server",
    ];
    for (const forbidden of nodeOnly) {
      expect(runtimeDeps).not.toContain(forbidden);
    }
    // Allowed runtime deps are isomorphic libraries + zod.
    for (const dep of runtimeDeps) {
      if (dep.startsWith("@vision-control/")) {
        expect([
          "@vision-control/change-ir",
          "@vision-control/security",
          "@vision-control/verification-engine",
        ]).toContain(dep);
      }
    }
  });
});
