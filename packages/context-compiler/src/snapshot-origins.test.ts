/**
 * End-to-end: map-origins-shaped MapOrigin data → compile → JSON/Markdown.
 *
 * Locks task-12: origins + originsTruncated appear in snapshot/export sections;
 * empty origins never crash.
 */

import { describe, expect, it } from "vitest";
import { renderSnapshotJson } from "./renderers/snapshot-json-renderer.js";
import { renderSnapshotMarkdown } from "./renderers/snapshot-markdown-renderer.js";
import { type CompileSnapshotInputs, compileVisionContextSnapshot } from "./snapshot-compiler.js";
import { type MapOrigin, MapOriginSchema, VisionContextSnapshotSchema } from "./snapshot-schema.js";

/** Fixture matching `@vision-control/map-origins` CSS high (map+range). */
const cssMapOrigin = (): MapOrigin => ({
  sourceUrl: "http://localhost:5173/assets/index.css",
  mapUrl: "http://localhost:5173/assets/index.css.map",
  relativePath: "src/Button.module.css",
  startLine: 12,
  startColumn: 0,
  endLine: 18,
  endColumn: 1,
  snippet: ".primary { color: red; }",
  confidence: "high",
  kind: "css",
  warnings: [],
});

/** Fixture matching map-origins JS medium (module-path-only). */
const jsMapOrigin = (): MapOrigin => ({
  sourceUrl: "http://localhost:5173/assets/index.js",
  mapUrl: "http://localhost:5173/assets/index.js.map",
  relativePath: "src/Button.tsx",
  confidence: "medium",
  kind: "js",
  warnings: ["module-path-only"],
});

const makeInputs = (overrides?: Partial<CompileSnapshotInputs>): CompileSnapshotInputs => ({
  snapshotRev: 1,
  compiledAt: 1_700_000_000_000,
  ...overrides,
});

describe("snapshot origins end-to-end (map-origins → compile → export)", () => {
  it("accepts map-origins CSS+JS shapes through MapOriginSchema", () => {
    expect(MapOriginSchema.safeParse(cssMapOrigin()).success).toBe(true);
    expect(MapOriginSchema.safeParse(jsMapOrigin()).success).toBe(true);
  });

  it("compiles empty origins without crash (ADR-019)", () => {
    const snapshot = compileVisionContextSnapshot(
      makeInputs({ origins: [], originsTruncated: false }),
    );
    expect(VisionContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.origins).toEqual([]);
    expect(snapshot.originsTruncated).toBe(false);

    const markdown = renderSnapshotMarkdown(snapshot);
    expect(markdown).toContain("## Map Origins");
    expect(markdown).toContain("_No map origins resolved._");
    expect(markdown).not.toContain("Origins truncated");

    const json = JSON.parse(renderSnapshotJson(snapshot)) as {
      origins: unknown[];
      originsTruncated: boolean;
    };
    expect(json.origins).toEqual([]);
    expect(json.originsTruncated).toBe(false);
  });

  it("includes CSS+JS origins and originsTruncated in snapshot, JSON, and Markdown", () => {
    const origins = [cssMapOrigin(), jsMapOrigin()];
    const snapshot = compileVisionContextSnapshot(
      makeInputs({
        origins,
        originsTruncated: true,
        confidence: "high",
      }),
    );

    expect(VisionContextSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.origins).toHaveLength(2);
    expect(snapshot.origins[0]?.kind).toBe("css");
    expect(snapshot.origins[0]?.relativePath).toBe("src/Button.module.css");
    expect(snapshot.origins[0]?.startLine).toBe(12);
    expect(snapshot.origins[1]?.kind).toBe("js");
    expect(snapshot.origins[1]?.relativePath).toBe("src/Button.tsx");
    expect(snapshot.originsTruncated).toBe(true);
    expect(snapshot.confidence).toBe("high");

    const markdown = renderSnapshotMarkdown(snapshot);
    expect(markdown).toContain("## Map Origins");
    expect(markdown).toContain("_Origins truncated by map caps (C4)._");
    expect(markdown).toContain("src/Button.module.css");
    expect(markdown).toContain("src/Button.tsx");
    expect(markdown).toContain("high");
    expect(markdown).toContain("medium");
    expect(markdown).toContain("css");
    expect(markdown).toContain("js");
    expect(markdown).toContain("module-path-only");

    const json = JSON.parse(renderSnapshotJson(snapshot)) as {
      origins: Array<{ relativePath?: string; kind?: string }>;
      originsTruncated: boolean;
    };
    expect(json.originsTruncated).toBe(true);
    expect(json.origins.map((o) => o.relativePath)).toEqual([
      "src/Button.module.css",
      "src/Button.tsx",
    ]);
  });

  it("defaults omitted origins to empty without requiring workspace", () => {
    const snapshot = compileVisionContextSnapshot({ snapshotRev: 0, compiledAt: 1 });
    expect(snapshot.origins).toEqual([]);
    expect(snapshot.originsTruncated).toBe(false);
    expect("workspaceRoot" in snapshot).toBe(false);
    expect(renderSnapshotMarkdown(snapshot)).toContain("_No map origins resolved._");
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
    expect(origin && "absolutePath" in origin).toBe(false);
    expect(origin && "workspaceRoot" in origin).toBe(false);
  });
});
