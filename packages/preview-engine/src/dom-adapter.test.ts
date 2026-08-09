import { beforeEach, describe, expect, it } from "vitest";

import { createBrowserPreviewDomAdapter, PREVIEW_ID_ATTR } from "./dom-adapter.js";

describe("PreviewDomAdapter temporary bindings", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("resolves a temporary binding without writing a preview identity attribute", () => {
    const dom = createBrowserPreviewDomAdapter();
    const element = document.createElement("div");
    const unbind = dom.bindElement("move-id", element);

    expect(dom.resolveElement("move-id")).toBe(element);
    expect(element.hasAttribute(PREVIEW_ID_ATTR)).toBe(false);

    unbind();
    expect(dom.resolveElement("move-id")).toBeNull();
  });

  it("preserves the newest active temporary binding across out-of-order cleanup", () => {
    const dom = createBrowserPreviewDomAdapter();
    const first = document.createElement("div");
    const second = document.createElement("div");
    const releaseFirst = dom.bindElement("move-id", first);
    const releaseSecond = dom.bindElement("move-id", second);

    releaseFirst();
    expect(dom.resolveElement("move-id")).toBe(second);

    releaseSecond();
    expect(dom.resolveElement("move-id")).toBeNull();
  });

  it("restores an active predecessor and never resurrects a replaced baseline", () => {
    const dom = createBrowserPreviewDomAdapter();
    const persistent = document.createElement("div");
    const temporary = document.createElement("div");
    const replacement = document.createElement("div");
    dom.registerElement("move-id", persistent);
    const releaseTemporary = dom.bindElement("move-id", temporary);

    releaseTemporary();
    expect(dom.resolveElement("move-id")).toBe(persistent);

    const staleRelease = dom.bindElement("move-id", temporary);
    dom.registerElement("move-id", replacement);
    staleRelease();
    expect(dom.resolveElement("move-id")).toBe(replacement);
    expect(replacement.getAttribute(PREVIEW_ID_ATTR)).toBe("move-id");
  });
});
