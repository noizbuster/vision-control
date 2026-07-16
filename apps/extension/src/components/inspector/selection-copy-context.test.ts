import type { MapOrigin } from "@vision-control/map-origins";
import { describe, expect, it } from "vitest";

import { createSelectionSummaryFixture } from "../../testing/selection-summary-fixture.js";
import { serializeSelectionCopyContext } from "./selection-copy-context.js";

const SECRET = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";

function valuesByKey(serialized: string): Readonly<Record<string, unknown>> {
  const entries = serialized
    .split("\n")
    .slice(1)
    .map((line) => {
      const separator = line.indexOf(": ");
      return [line.slice(0, separator), JSON.parse(line.slice(separator + 2))] as const;
    });
  return Object.fromEntries(entries);
}

describe("serializeSelectionCopyContext", () => {
  it("uses the stable v1 header, key order, and redacted snapshot projections", () => {
    const serialized = serializeSelectionCopyContext({
      pageUrl: "http://localhost:5173/account",
      selection: createSelectionSummaryFixture(),
      origins: [
        {
          relativePath: "src/Button.tsx",
          startLine: 12,
          confidence: "high",
          kind: "js",
          warnings: [],
        },
      ],
      originsTruncated: false,
    });

    expect(serialized.split("\n").map((line) => line.split(":")[0])).toEqual([
      "vision-control-selection/v1",
      "page_url",
      "selector",
      "identity",
      "semantic",
      "breadcrumb",
      "origins",
      "origins_truncated",
    ]);
    expect(valuesByKey(serialized)).toMatchObject({
      page_url: "http://localhost:5173/account",
      selector: "#submit",
      identity: { runtimeId: "runtime-1", sourceId: "src-button-1" },
      semantic: { tagName: "button", name: "Submit" },
      origins: [{ relativePath: "src/Button.tsx", startLine: 12 }],
      origins_truncated: false,
    });
  });

  it("encodes absent optional selection data without inventing values", () => {
    const selection = createSelectionSummaryFixture();
    selection.identity = {
      runtimeId: "runtime-1",
      tagName: "button",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "low",
    };
    selection.semantic = { tagName: "button", textContentPreview: "" };
    selection.breadcrumb = [{ tagName: "body" }, { tagName: "button" }];

    const values = valuesByKey(
      serializeSelectionCopyContext({
        pageUrl: "about:blank",
        selection,
        origins: [],
        originsTruncated: false,
      }),
    );

    expect(values.selector).toBeNull();
    expect(values.identity).toEqual({
      runtimeId: "runtime-1",
      fingerprint: "abc12345",
      confidence: "low",
      selectors: [],
    });
    expect(values.semantic).toEqual({ tagName: "button", textContentPreview: "" });
    expect(values.breadcrumb).toEqual([{ tagName: "body" }, { tagName: "button" }]);
  });

  it("includes every origin and preserves the content-side truncation flag", () => {
    const origins: MapOrigin[] = Array.from({ length: 25 }, (_, index) => ({
      relativePath: `src/Origin-${index}.tsx`,
      confidence: "medium",
      warnings: [],
    }));

    const values = valuesByKey(
      serializeSelectionCopyContext({
        pageUrl: "http://localhost:5173/",
        selection: createSelectionSummaryFixture(),
        origins,
        originsTruncated: true,
      }),
    );

    expect(values.origins).toHaveLength(25);
    expect(values.origins_truncated).toBe(true);
  });

  it("redacts secrets in the URL, semantic, breadcrumb, and every origin string", () => {
    const selection = createSelectionSummaryFixture();
    selection.semantic = {
      ...selection.semantic,
      name: `authorization: Bearer ${SECRET}`,
      textContentPreview: `api_key=${SECRET}`,
    };
    selection.breadcrumb = [
      { tagName: "body", selector: `#token-${SECRET}` },
      { tagName: "button", className: `password=${SECRET}` },
    ];

    const serialized = serializeSelectionCopyContext({
      pageUrl: `http://localhost:5173/?token=${SECRET}`,
      selection,
      origins: [
        {
          sourceUrl: `http://localhost/assets/app.js?token=${SECRET}`,
          mapUrl: `http://localhost/assets/app.js.map?api_key=${SECRET}`,
          relativePath: `src/${SECRET}/Button.tsx`,
          snippet: `authorization: Bearer ${SECRET}`,
          confidence: "high",
          kind: "js",
          warnings: [`password=${SECRET}`],
        },
      ],
      originsTruncated: false,
    });

    expect(serialized).toContain("[REDACTED");
    expect(serialized).not.toContain(SECRET);
  });
});
