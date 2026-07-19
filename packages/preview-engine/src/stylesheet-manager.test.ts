import { beforeEach, describe, expect, it } from "vitest";
import { createTestDomAdapter, FakeMutationObserver } from "./__fixtures__/helpers.js";
import { applyCssRule, buildPreviewSelector, createStylesheetManager } from "./index.js";

const readCss = (): string =>
  document.querySelector("style[data-vc-preview-stylesheet]")?.textContent ?? "";

describe("stylesheet manager rollback", () => {
  beforeEach(() => {
    document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((element) => {
      element.remove();
    });
  });

  it("restores overwritten declarations byte-for-byte", () => {
    const stylesheet = createStylesheetManager(createTestDomAdapter(FakeMutationObserver));
    const selector = buildPreviewSelector("card-primary");
    const prior = "color:red;  margin: 0  4px!important;";
    stylesheet.applyRule(selector, prior);

    const rollback = applyCssRule(stylesheet, "card-primary", "flex-basis: 240px;");
    rollback();

    expect(readCss()).toBe(`${selector} { ${prior} }`);
  });

  it("removes a selector only when it did not exist before", () => {
    const stylesheet = createStylesheetManager(createTestDomAdapter(FakeMutationObserver));
    const rollback = applyCssRule(stylesheet, "card-primary", "flex-basis: 240px;");

    rollback();

    expect(stylesheet.hasRule(buildPreviewSelector("card-primary"))).toBe(false);
    expect(stylesheet.ruleCount()).toBe(0);
  });

  it("does not let a stale rollback overwrite the latest rule", () => {
    const stylesheet = createStylesheetManager(createTestDomAdapter(FakeMutationObserver));
    const selector = buildPreviewSelector("card-primary");
    stylesheet.applyRule(selector, "flex-basis: 200px;");
    const rollbackFirst = applyCssRule(stylesheet, "card-primary", "flex-basis: 220px;");
    const rollbackSecond = applyCssRule(stylesheet, "card-primary", "flex-basis: 240px;");

    rollbackFirst();
    expect(readCss()).toBe(`${selector} { flex-basis: 240px; }`);
    rollbackSecond();
    expect(readCss()).toBe(`${selector} { flex-basis: 200px; }`);
    rollbackFirst();
    expect(readCss()).toBe(`${selector} { flex-basis: 200px; }`);
  });

  it("does not resurrect declarations when rollback runs after clear", () => {
    const stylesheet = createStylesheetManager(createTestDomAdapter(FakeMutationObserver));
    const selector = buildPreviewSelector("card-primary");
    stylesheet.applyRule(selector, "flex-basis: 200px;");
    const rollback = applyCssRule(stylesheet, "card-primary", "flex-basis: 240px;");
    stylesheet.clear();

    rollback();

    expect(document.querySelector("style[data-vc-preview-stylesheet]")).toBeNull();
    expect(stylesheet.ruleCount()).toBe(0);
  });
});
