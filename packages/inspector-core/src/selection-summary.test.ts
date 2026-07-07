import { afterEach, describe, expect, it } from "vitest";

import { buildSelectionSummary, createBrowserDomAdapter } from "./index.js";

function createIdentity(overrides?: { selector?: string; sourceId?: string }) {
  return {
    runtimeId: "runtime-1",
    tagName: "button",
    frameId: "main",
    fingerprint: "abc12345",
    confidence: "medium" as const,
    selector: overrides?.selector ?? "section#wrapper > button",
    sourceId: overrides?.sourceId,
  };
}

describe("selection summary", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("includes identity, breadcrumb, computed style, box model, classes, attributes, semantic, siblings, and parent layout", () => {
    const parent = document.createElement("section");
    parent.id = "wrapper";
    document.body.appendChild(parent);

    const child = document.createElement("button");
    child.setAttribute("aria-label", "Submit");
    child.setAttribute("role", "button");
    child.setAttribute("type", "submit");
    child.className = "btn primary";
    parent.appendChild(child);

    const adapter = createBrowserDomAdapter();
    const identity = createIdentity();
    const summary = buildSelectionSummary(child, adapter, identity);

    expect(summary.identity).toBe(identity);
    expect(summary.semantic.tagName).toBe("button");
    expect(summary.semantic.role).toBe("button");
    expect(summary.semantic.name).toBe("Submit");
    expect(summary.breadcrumb.at(-1)?.tagName).toBe("button");
    expect(summary.breadcrumb.some((item) => item.id === "wrapper")).toBe(true);
    expect(summary.parentLayout.mode).toBe("block");
    expect(summary.classList.map((entry) => entry.name)).toEqual(["btn", "primary"]);
    expect(summary.attributes.some((attr) => attr.name === "type")).toBe(true);
    expect(summary.attributes.every((attr) => attr.name !== "style")).toBe(true);
    expect(summary.siblingSummary.count).toBe(1);
    expect(summary.sourceConfidence).toBe("medium");
    expect(summary.boxModel.content.width).toBeGreaterThanOrEqual(0);
  });

  it("includes a parent ref when a runtime id resolver is provided", () => {
    const parent = document.createElement("section");
    parent.id = "wrapper";
    document.body.appendChild(parent);

    const child = document.createElement("button");
    child.id = "submit";
    parent.appendChild(child);

    const adapter = createBrowserDomAdapter();
    const summary = buildSelectionSummary(child, adapter, createIdentity(), {
      runtimeIdForElement: (element) => (element === parent ? "parent-1" : "runtime-1"),
    });

    expect(summary.siblingSummary.parent).toMatchObject({
      runtimeId: "parent-1",
      tagName: "section",
      selector: "#wrapper",
    });
  });

  it("flags high confidence when a source marker is present", () => {
    const el = document.createElement("div");
    el.setAttribute("data-vc-source", "src/App.tsx:5");
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const identity = {
      ...createIdentity({ sourceId: "src/App.tsx:5", selector: "[data-vc-source]" }),
      confidence: "high" as const,
    };
    const summary = buildSelectionSummary(el, adapter, identity);

    expect(summary.sourceConfidence).toBe("high");
  });
});
