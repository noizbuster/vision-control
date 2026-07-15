import { describe, expect, it, vi } from "vitest";

import { emptySelectionOrigins, resolveSelectionOrigins } from "./resolve-selection-origins.js";

describe("resolveSelectionOrigins", () => {
  it("returns empty origins without crash when no maps exist", async () => {
    // Given: a plain element with no stylesheets/scripts maps
    const document = window.document;
    document.body.innerHTML = `<button id="submit" class="primary">Go</button>`;
    const element = document.querySelector("#submit");
    expect(element).not.toBeNull();

    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));

    // When: resolve with page fetch
    const result = await resolveSelectionOrigins(element as Element, {
      fetch: fetchMock as typeof fetch,
      document,
      now: () => 1_700_000_000_000,
    });

    // Then: empty is valid; no throw
    expect(result.origins).toEqual([]);
    expect(result.originsTruncated).toBe(false);
  });

  it("emptySelectionOrigins is the safe panel default", () => {
    const empty = emptySelectionOrigins();
    expect(empty.origins).toEqual([]);
    expect(empty.originsTruncated).toBe(false);
  });

  it("resolves CSS origin when inline stylesheet text + map are available", async () => {
    const document = window.document;
    document.head.innerHTML = "";
    document.body.innerHTML = `<button id="submit" class="primary">Go</button>`;
    const element = document.querySelector("#submit");
    expect(element).not.toBeNull();

    const style = document.createElement("style");
    style.textContent = `.primary { color: red; }\n/*# sourceMappingURL=http://localhost/button.css.map */`;
    document.head.appendChild(style);

    const mapBody = JSON.stringify({
      version: 3,
      file: "button.css",
      sources: ["src/Button.module.css"],
      sourcesContent: [".primary {\n  color: red;\n}\n"],
      mappings: "AAAA;AACA;AACA",
      names: [],
    });

    const fetchMock = vi.fn(async (input: string) => {
      if (String(input).includes("button.css.map")) {
        return new Response(mapBody, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("missing", { status: 404 });
    });

    const result = await resolveSelectionOrigins(element as Element, {
      fetch: fetchMock as typeof fetch,
      document,
      now: () => 1_700_000_000_000,
    });

    expect(result.originsTruncated).toBe(false);
    expect(result.origins.length).toBeGreaterThanOrEqual(1);
    const css = result.origins.find((o) => o.kind === "css");
    expect(css?.relativePath).toBe("src/Button.module.css");
    expect(css?.confidence === "high" || css?.confidence === "medium").toBe(true);
  });
});
