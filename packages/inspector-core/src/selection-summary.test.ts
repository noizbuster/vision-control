import { afterEach, describe, expect, it } from "vitest";

import { buildSelectionSummary, createBrowserDomAdapter } from "./index.js";

describe("selection summary", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("includes tagName, role, name, selector, and parent layout", () => {
    const parent = document.createElement("section");
    parent.id = "wrapper";
    document.body.appendChild(parent);

    const child = document.createElement("button");
    child.setAttribute("aria-label", "Submit");
    child.setAttribute("role", "button");
    parent.appendChild(child);

    const adapter = createBrowserDomAdapter();
    const data = adapter.getElementData(child);
    const summary = buildSelectionSummary(data, "section#wrapper > button");

    expect(summary.tagName).toBe("button");
    expect(summary.role).toBe("button");
    expect(summary.name).toBe("Submit");
    expect(summary.selector).toBe("section#wrapper > button");
    expect(summary.breadcrumb).toContain("section#wrapper");
    expect(summary.parentLayout).toBe("block");
  });
});
