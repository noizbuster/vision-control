import { afterEach, describe, expect, it } from "vitest";

import {
  buildAttributes,
  buildBoxModelSummary,
  buildBreadcrumb,
  buildClassList,
  buildComputedStyleSummary,
  buildSelectionSummary,
  buildSemanticSummary,
  buildSiblingSummary,
  createBrowserDomAdapter,
  createClassAddCommand,
  createClassRemoveCommand,
  createClassReplaceCommand,
  createStyleEditCommand,
  createTextEditCommand,
  redactInspectorSummary,
  validateCssProperty,
  validateCssValue,
} from "./index.js";

const SECRET = "VC_SECRET_SHOULD_NOT_EXPORT";

function makeIdentity() {
  return {
    runtimeId: "runtime-1",
    tagName: "div",
    frameId: "main",
    fingerprint: "abc12345",
    confidence: "low" as const,
  };
}

describe("inspector data builders", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("builds a breadcrumb from the element to the root", () => {
    const root = document.createElement("main");
    const section = document.createElement("section");
    const button = document.createElement("button");
    section.appendChild(button);
    root.appendChild(section);
    document.body.appendChild(root);

    const adapter = createBrowserDomAdapter();
    const crumb = buildBreadcrumb(button, adapter);

    expect(crumb.at(-1)?.tagName).toBe("button");
    expect(crumb.some((item) => item.tagName === "main")).toBe(true);
    expect(crumb.length).toBeLessThanOrEqual(10);
  });

  it("truncates breadcrumbs deeper than 10 levels", () => {
    let current = document.body;
    for (let i = 0; i < 15; i += 1) {
      const wrapper = document.createElement("div");
      wrapper.id = `level-${i}`;
      current.appendChild(wrapper);
      current = wrapper;
    }
    const target = document.createElement("span");
    current.appendChild(target);

    const adapter = createBrowserDomAdapter();
    const crumb = buildBreadcrumb(target, adapter);

    expect(crumb.length).toBe(10);
  });

  it("extracts the MVP-relevant computed style subset", () => {
    const el = document.createElement("div");
    el.style.display = "flex";
    el.style.flexDirection = "column";
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const style = buildComputedStyleSummary(el, adapter);

    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("column");
    expect(style.width).toBeDefined();
    expect(style.fontSize).toBeDefined();
  });

  it("builds a numeric box model", () => {
    const el = document.createElement("div");
    el.style.margin = "10px";
    el.style.padding = "5px";
    el.style.border = "2px solid black";
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const box = buildBoxModelSummary(el, adapter);

    expect(box.margin.top).toBe(10);
    expect(box.padding.top).toBe(5);
    expect(box.border.top).toBe(2);
    expect(box.content.width).toBeGreaterThanOrEqual(0);
  });

  it("parses classes and tags Tailwind utilities", () => {
    const el = document.createElement("div");
    el.className = "flex p-4 custom-class";
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const classes = buildClassList(el, adapter);

    expect(classes.map((entry) => entry.name)).toEqual(["flex", "p-4", "custom-class"]);
    expect(classes[0]?.source).toBe("tailwind");
    expect(classes[2]?.source).toBe("unknown");
  });

  it("filters attributes to the safe subset", () => {
    const el = document.createElement("a");
    el.id = "link";
    el.setAttribute("href", "/path");
    el.setAttribute("data-testid", "nav-link");
    el.setAttribute("onclick", "alert(1)");
    el.setAttribute("style", "color: red;");
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const attrs = buildAttributes(el, adapter);
    const names = attrs.map((attr) => attr.name);

    expect(names).toContain("id");
    expect(names).toContain("href");
    expect(names).toContain("data-testid");
    expect(names).not.toContain("onclick");
    expect(names).not.toContain("style");
    expect(names).not.toContain("data-vc-source");
  });

  it("excludes password and hidden input values", () => {
    const form = document.createElement("form");
    const password = document.createElement("input");
    password.type = "password";
    password.setAttribute("value", SECRET);
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.setAttribute("name", "api_key");
    hidden.setAttribute("value", "sk_test_VC_SECRET_KEY");
    const text = document.createElement("input");
    text.type = "text";
    text.setAttribute("value", "visible");
    form.appendChild(password);
    form.appendChild(hidden);
    form.appendChild(text);
    document.body.appendChild(form);

    const adapter = createBrowserDomAdapter();
    const passwordAttrs = buildAttributes(password, adapter);
    const hiddenAttrs = buildAttributes(hidden, adapter);
    const textAttrs = buildAttributes(text, adapter);

    expect(passwordAttrs.some((attr) => attr.name === "value")).toBe(false);
    expect(hiddenAttrs.some((attr) => attr.name === "value")).toBe(false);
    expect(textAttrs.find((attr) => attr.name === "value")?.value).toBe("visible");
  });

  it("redacts secret-like attribute values", () => {
    const el = document.createElement("div");
    el.setAttribute("data-token", "sk_test_12345678901234567890");
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const attrs = buildAttributes(el, adapter);

    expect(attrs.some((attr) => attr.name === "data-token")).toBe(false);
  });

  it("builds a semantic summary with role fallback", () => {
    const el = document.createElement("button");
    el.setAttribute("aria-label", "Save");
    document.body.appendChild(el);

    const adapter = createBrowserDomAdapter();
    const semantic = buildSemanticSummary(el, adapter);

    expect(semantic.role).toBe("button");
    expect(semantic.name).toBe("Save");
    expect(semantic.tagName).toBe("button");
  });

  it("summarizes sibling context", () => {
    const ul = document.createElement("ul");
    const li1 = document.createElement("li");
    const li2 = document.createElement("li");
    ul.appendChild(li1);
    ul.appendChild(li2);
    document.body.appendChild(ul);

    const adapter = createBrowserDomAdapter();
    const siblings = buildSiblingSummary(li2, adapter);

    expect(siblings.count).toBe(2);
    expect(siblings.index).toBe(1);
    expect(siblings.parentTagName).toBe("ul");
  });

  it("redacts a complete summary and removes the PrivateFields secret", () => {
    const form = document.createElement("form");
    form.className = "space-y-4 p-6";
    const password = document.createElement("input");
    password.type = "password";
    password.value = SECRET;
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "api_key";
    hidden.value = "sk_test_VC_SECRET_KEY";
    form.appendChild(password);
    form.appendChild(hidden);
    document.body.appendChild(form);

    const adapter = createBrowserDomAdapter();
    const summary = buildSelectionSummary(form, adapter, makeIdentity());
    const redacted = redactInspectorSummary(summary);
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain("sk_test_VC_SECRET_KEY");
  });
});

describe("command factories", () => {
  const target = { runtimeId: "runtime-1", selector: "#submit" };
  const timestamp = 1234567890123;

  it("creates a StyleEditCommand with runtime:false", () => {
    const op = createStyleEditCommand(target, "padding", "16px", "8px", {
      id: "op-style-0001",
      timestamp,
    });

    expect(op.kind).toBe("style-edit");
    expect(op.target.runtimeId).toBe("runtime-1");
    expect(op.target.selector).toBe("#submit");
    expect(op.property).toBe("padding");
    expect(op.value).toBe("16px");
    expect(op.previousValue).toBe("8px");
    expect(op.important).toBe(false);
    expect(op.runtime).toBe(false);
    expect(op.timestamp).toBe(timestamp);
    expect(op.id).toBe("op-style-0001");
  });

  it("creates a ClassAddCommand", () => {
    const op = createClassAddCommand(target, "btn-primary", { id: "op-add-0001", timestamp });

    expect(op.kind).toBe("class-add");
    expect(op.className).toBe("btn-primary");
    expect(op.runtime).toBe(false);
  });

  it("creates a ClassRemoveCommand", () => {
    const op = createClassRemoveCommand(target, "btn-secondary", {
      id: "op-remove-0001",
      timestamp,
    });

    expect(op.kind).toBe("class-remove");
    expect(op.className).toBe("btn-secondary");
    expect(op.runtime).toBe(false);
  });

  it("creates a ClassReplaceCommand", () => {
    const op = createClassReplaceCommand(target, "old", "new", {
      id: "op-replace-0001",
      timestamp,
    });

    expect(op.kind).toBe("class-replace");
    expect(op.oldClassName).toBe("old");
    expect(op.newClassName).toBe("new");
    expect(op.runtime).toBe(false);
  });

  it("creates a TextEditCommand", () => {
    const op = createTextEditCommand(target, "Save changes", "Save", {
      id: "op-text-0001",
      timestamp,
    });

    expect(op.kind).toBe("text-edit");
    expect(op.newText).toBe("Save changes");
    expect(op.previousText).toBe("Save");
    expect(op.runtime).toBe(false);
  });

  it("omits optional previousValue when undefined", () => {
    const op = createStyleEditCommand(target, "color", "red", undefined, {
      id: "op-style-0002",
      timestamp,
    });

    expect(op.previousValue).toBeUndefined();
  });
});

describe("css validation", () => {
  it("accepts known MVP properties", () => {
    expect(validateCssProperty("padding")).toBe(true);
    expect(validateCssProperty("color")).toBe(true);
    expect(validateCssProperty("display")).toBe(true);
  });

  it("rejects unknown properties", () => {
    expect(validateCssProperty("paddding")).toBe(false);
    expect(validateCssProperty("")).toBe(false);
  });

  it("accepts valid length and percentage values", () => {
    expect(validateCssValue("padding", "16px").valid).toBe(true);
    expect(validateCssValue("padding", "1rem").valid).toBe(true);
    expect(validateCssValue("padding", "50%").valid).toBe(true);
    expect(validateCssValue("padding", "0").valid).toBe(true);
  });

  it("accepts valid colors", () => {
    expect(validateCssValue("color", "red").valid).toBe(true);
    expect(validateCssValue("color", "#ff0000").valid).toBe(true);
    expect(validateCssValue("background-color", "rgb(255, 0, 0)").valid).toBe(true);
    expect(validateCssValue("color", "hsl(0, 100%, 50%)").valid).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(validateCssValue("padding", "abc").valid).toBe(false);
    expect(validateCssValue("color", "16px").valid).toBe(false);
    expect(validateCssValue("display", "blocky").valid).toBe(false);
  });

  it("rejects empty values", () => {
    expect(validateCssValue("padding", "").valid).toBe(false);
  });

  it("validates border shorthand", () => {
    expect(validateCssValue("border", "1px solid red").valid).toBe(true);
    expect(validateCssValue("border", "solid").valid).toBe(false);
  });
});
