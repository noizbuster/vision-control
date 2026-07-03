import { expect, test } from "@playwright/test";

import { toSelectionIdentity } from "@vision-control/element-identity";
import { createSourceEntry, SourceRegistry } from "@vision-control/source-registry";
import { SourceResolver } from "@vision-control/source-resolver";
import { CssTokenIndex } from "@vision-control/workspace-index";

/**
 * Risk gate R2: source mapping false positives.
 *
 * Two identical buttons rendered from DIFFERENT source files (IdenticalButtonsA
 * vs IdenticalButtonsB) must NEVER both resolve to the same source location
 * with HIGH confidence. Each button's `data-vc-source` marker is a distinct
 * opaque id that maps to a distinct file/range. The resolver must refuse to
 * collapse them.
 *
 * This test runs at the unit level: it seeds a SourceRegistry with two entries
 * and resolves both identities through the real SourceResolver. No browser
 * needed.
 */

const makeRegistry = (): SourceRegistry => {
  const registry = new SourceRegistry();
  registry.register(
    createSourceEntry({
      sourceId: "btn-a-001",
      workspaceRelativePath: "src/fixtures/IdenticalButtonsA.tsx",
      range: { startLine: 3, startColumn: 4, endLine: 8, endColumn: 12 },
      componentName: "IdenticalButtonsA",
      fingerprint: "fp-aaaa1111",
    }),
  );
  registry.register(
    createSourceEntry({
      sourceId: "btn-b-002",
      workspaceRelativePath: "src/fixtures/IdenticalButtonsB.tsx",
      range: { startLine: 3, startColumn: 4, endLine: 8, endColumn: 12 },
      componentName: "IdenticalButtonsB",
      fingerprint: "fp-bbbb2222",
    }),
  );
  return registry;
};

const makeResolver = (): SourceResolver =>
  new SourceResolver({
    registry: makeRegistry(),
    cssTokenIndex: new CssTokenIndex(),
    workspaceRoot: "/workspace",
  });

test.describe("risk: source mapping false positives", () => {
  test("identical buttons from different files resolve to different paths", () => {
    const resolver = makeResolver();

    const identityA = toSelectionIdentity(
      { runtimeId: "rt-a", sourceId: "btn-a-001", tagName: "button" },
      { frameId: "main", fingerprint: "fp-aaaa1111", confidence: "high" },
    );
    const identityB = toSelectionIdentity(
      { runtimeId: "rt-b", sourceId: "btn-b-002", tagName: "button" },
      { frameId: "main", fingerprint: "fp-bbbb2222", confidence: "high" },
    );

    const resultA = resolver.resolve(identityA);
    const resultB = resolver.resolve(identityB);

    expect(resultA.workspaceRelativePath).toBe("src/fixtures/IdenticalButtonsA.tsx");
    expect(resultB.workspaceRelativePath).toBe("src/fixtures/IdenticalButtonsB.tsx");
    expect(resultA.workspaceRelativePath).not.toBe(resultB.workspaceRelativePath);
  });

  test("both buttons get HIGH confidence (correct marker match)", () => {
    const resolver = makeResolver();
    const identityA = toSelectionIdentity(
      { runtimeId: "rt-a", sourceId: "btn-a-001", tagName: "button" },
      { frameId: "main", fingerprint: "fp-aaaa1111", confidence: "high" },
    );
    const identityB = toSelectionIdentity(
      { runtimeId: "rt-b", sourceId: "btn-b-002", tagName: "button" },
      { frameId: "main", fingerprint: "fp-bbbb2222", confidence: "high" },
    );
    expect(resolver.resolve(identityA).confidence).toBe("high");
    expect(resolver.resolve(identityB).confidence).toBe("high");
  });

  test("stale fingerprint downgrades to MEDIUM, never wrong HIGH", () => {
    const resolver = makeResolver();
    const staleIdentity = toSelectionIdentity(
      { runtimeId: "rt-a", sourceId: "btn-a-001", tagName: "button" },
      { frameId: "main", fingerprint: "fp-changed-9999", confidence: "high" },
    );
    const result = resolver.resolve(staleIdentity);
    expect(result.confidence).toBe("medium");
    expect(result.warnings).toContain(
      "stale registry: element fingerprint changed since registration",
    );
  });

  test("repeated instances share source id but are downgraded to MEDIUM", () => {
    const resolver = makeResolver();
    const identity = toSelectionIdentity(
      { runtimeId: "rt-list-1", sourceId: "btn-a-001", tagName: "button" },
      { frameId: "main", fingerprint: "fp-aaaa1111", confidence: "high" },
    );
    const result = resolver.resolve(identity, { runtimeInstanceCount: 5 });
    expect(result.confidence).toBe("medium");
    expect(result.warnings.some((w) => w.includes("repeated instance ambiguity"))).toBe(true);
  });

  test("unknown source id falls through to LOW, never wrong HIGH", () => {
    const resolver = makeResolver();
    const identity = toSelectionIdentity(
      { runtimeId: "rt-x", sourceId: "nonexistent", tagName: "button" },
      { frameId: "main", fingerprint: "fp-unknown", confidence: "low" },
    );
    const result = resolver.resolve(identity);
    expect(result.confidence).toBe("low");
  });
});
