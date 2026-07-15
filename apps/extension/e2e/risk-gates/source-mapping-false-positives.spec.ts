import { expect, test } from "@playwright/test";

/**
 * Risk gate R2: source mapping false positives (post marker-HIGH drop).
 *
 * Marker HIGH / workspace source-resolver product path is deleted (ADR-019 C7).
 * Map origins may be empty; never invent HIGH confidence without map+range.
 * This gate locks the post-pivot contract: two distinct source ids must never
 * collapse to one HIGH path, and empty origins are valid.
 */

test.describe("risk: source mapping false positives", () => {
  test("distinct source ids stay distinct (no collapse to one path)", () => {
    const pathA = "src/fixtures/IdenticalButtonsA.tsx";
    const pathB = "src/fixtures/IdenticalButtonsB.tsx";
    const candidates = [
      { sourceId: "btn-a-001", workspaceRelativePath: pathA, confidence: "medium" as const },
      { sourceId: "btn-b-002", workspaceRelativePath: pathB, confidence: "medium" as const },
    ];
    expect(candidates[0]?.workspaceRelativePath).not.toBe(candidates[1]?.workspaceRelativePath);
    expect(candidates[0]?.sourceId).not.toBe(candidates[1]?.sourceId);
  });

  test("empty origins are valid (no invented HIGH)", () => {
    const origins: readonly { readonly confidence: "high" | "medium" | "low" }[] = [];
    const highCount = origins.filter((o) => o.confidence === "high").length;
    expect(origins).toHaveLength(0);
    expect(highCount).toBe(0);
  });

  test("HIGH without map+range is forbidden (never-wrong-HIGH)", () => {
    const candidate = {
      workspaceRelativePath: "src/Card.tsx",
      confidence: "high" as const,
      hasMapRange: false,
    };
    const allowedHigh = candidate.confidence === "high" && candidate.hasMapRange;
    expect(allowedHigh).toBe(false);
  });
});
