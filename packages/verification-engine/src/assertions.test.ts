/**
 * Assertion unit tests: existence, text, class, computed-style, parent,
 * sibling-order, geometry (tolerance), accessibility, console-policy.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  assertClass,
  assertComputedStyle,
  assertConsoleClean,
  assertExists,
  assertGeometry,
  assertName,
  assertParent,
  assertRole,
  assertSiblingOrder,
  assertText,
  type ConsoleEntry,
  createBrowserVerificationDomAdapter,
  type VerificationDomAdapter,
} from "./index.js";

function setupTarget(
  html: string,
  selector: string,
  dom?: VerificationDomAdapter,
): {
  target: {
    element: Element;
    dom: VerificationDomAdapter;
    runtimeId: string;
    confidence: "high";
  };
  element: Element;
} {
  document.body.innerHTML = html;
  const adapter = dom ?? createBrowserVerificationDomAdapter({ captureConsole: false });
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`test setup: selector ${selector} not found`);
  return {
    element,
    target: { element, dom: adapter, runtimeId: "rt-test", confidence: "high" },
  };
}

describe("assertExists", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes when element is connected", () => {
    const { target } = setupTarget("<div id='a'>x</div>", "#a");
    const result = assertExists(target);
    expect(result.passed).toBe(true);
  });

  it("fails when element is disconnected", () => {
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.createElement("div");
    // Not appended to document — isConnected is false.
    const result = assertExists({ element: el, dom, runtimeId: "rt", confidence: "high" });
    expect(result.passed).toBe(false);
    expect(result.message).toContain("not connected");
  });
});

describe("assertText", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes when text matches (trimmed)", () => {
    const { target } = setupTarget("<button id='b'>  Submit  </button>", "#b");
    const result = assertText(target, "Submit");
    expect(result.passed).toBe(true);
  });

  it("fails on text mismatch", () => {
    const { target } = setupTarget("<button id='b'>Cancel</button>", "#b");
    const result = assertText(target, "Submit");
    expect(result.passed).toBe(false);
    expect(result.actual).toBe("Cancel");
  });
});

describe("assertClass", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes when expected class is present", () => {
    const { target } = setupTarget("<div id='d' class='foo bar'></div>", "#d");
    const result = assertClass(target, [{ name: "foo", present: true }]);
    expect(result.passed).toBe(true);
  });

  it("passes when expected class is absent", () => {
    const { target } = setupTarget("<div id='d' class='bar'></div>", "#d");
    const result = assertClass(target, [{ name: "foo", present: false }]);
    expect(result.passed).toBe(true);
  });

  it("fails when a class is unexpectedly missing", () => {
    const { target } = setupTarget("<div id='d' class='bar'></div>", "#d");
    const result = assertClass(target, [{ name: "foo", present: true }]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('missing class "foo"');
  });

  it("fails when a class is unexpectedly present", () => {
    const { target } = setupTarget("<div id='d' class='foo bar'></div>", "#d");
    const result = assertClass(target, [{ name: "foo", present: false }]);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('unexpected class "foo"');
  });
});

describe("assertComputedStyle", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes when computed style matches (normalized)", () => {
    const { target } = setupTarget("<div id='d' style='color: rgb(255, 0, 0)'></div>", "#d");
    const result = assertComputedStyle(target, [{ property: "color", value: "rgb(255, 0, 0)" }]);
    expect(result.passed).toBe(true);
  });

  it("fails on style mismatch", () => {
    const { target } = setupTarget("<div id='d' style='color: rgb(0, 0, 255)'></div>", "#d");
    const result = assertComputedStyle(target, [{ property: "color", value: "rgb(255, 0, 0)" }]);
    expect(result.passed).toBe(false);
  });
});

describe("assertParent", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes when parent matches selector", () => {
    document.body.innerHTML = "<div id='container'><span id='child'>x</span></div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const child = document.querySelector("#child")!;
    const result = assertParent(
      { element: child, dom, runtimeId: "rt", confidence: "high" },
      "#container",
    );
    expect(result.passed).toBe(true);
  });

  it("fails when parent does not match", () => {
    document.body.innerHTML = "<div id='other'><span id='child'>x</span></div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const child = document.querySelector("#child")!;
    const result = assertParent(
      { element: child, dom, runtimeId: "rt", confidence: "high" },
      "#container",
    );
    expect(result.passed).toBe(false);
  });
});

describe("assertSiblingOrder", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes at correct index", () => {
    document.body.innerHTML = "<ul><li>a</li><li id='b'>b</li><li>c</li></ul>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const li = document.querySelector("#b")!;
    const result = assertSiblingOrder({ element: li, dom, runtimeId: "rt", confidence: "high" }, 1);
    expect(result.passed).toBe(true);
  });

  it("fails at wrong index", () => {
    document.body.innerHTML = "<ul><li>a</li><li id='b'>b</li><li>c</li></ul>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const li = document.querySelector("#b")!;
    const result = assertSiblingOrder({ element: li, dom, runtimeId: "rt", confidence: "high" }, 0);
    expect(result.passed).toBe(false);
    expect(result.actual).toBe("1");
  });
});

describe("assertGeometry (tolerance)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("passes when rect is within 1px tolerance", () => {
    document.body.innerHTML = "<div id='d' style='width:100px;height:50px'></div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    const actual = dom.getRect(el);
    // Expected rect with x/y nudged by 0.5px — within tolerance 1.
    const expected = {
      x: actual.x + 0.5,
      y: actual.y - 0.5,
      width: actual.width,
      height: actual.height,
    };
    const result = assertGeometry(
      { element: el, dom, runtimeId: "rt", confidence: "high" },
      expected,
      1,
    );
    expect(result.passed).toBe(true);
  });

  it("fails when rect differs by more than 1px", () => {
    document.body.innerHTML = "<div id='d' style='width:100px;height:50px'></div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    const actual = dom.getRect(el);
    // Expected rect shifted by 5px — outside tolerance 1.
    const expected = { x: actual.x + 5, y: actual.y, width: actual.width, height: actual.height };
    const result = assertGeometry(
      { element: el, dom, runtimeId: "rt", confidence: "high" },
      expected,
      1,
    );
    expect(result.passed).toBe(false);
  });

  it("uses default tolerance (1px) when not specified", () => {
    document.body.innerHTML = "<div id='d' style='width:100px;height:50px'></div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    const actual = dom.getRect(el);
    // Exactly 1px off — within tolerance (<=).
    const expected = { x: actual.x + 1, y: actual.y, width: actual.width, height: actual.height };
    const result = assertGeometry(
      { element: el, dom, runtimeId: "rt", confidence: "high" },
      expected,
    );
    expect(result.passed).toBe(true);
  });
});

describe("assertRole / assertName", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("assertRole passes with explicit role", () => {
    document.body.innerHTML = "<div id='d' role='tab'>x</div>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    expect(
      assertRole({ element: el, dom, runtimeId: "rt", confidence: "high" }, "tab").passed,
    ).toBe(true);
  });

  it("assertRole derives implicit role from tag", () => {
    document.body.innerHTML = "<button id='d'>x</button>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    expect(
      assertRole({ element: el, dom, runtimeId: "rt", confidence: "high" }, "button").passed,
    ).toBe(true);
  });

  it("assertName passes with aria-label", () => {
    document.body.innerHTML = "<button id='d' aria-label='Save'>x</button>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    expect(
      assertName({ element: el, dom, runtimeId: "rt", confidence: "high" }, "Save").passed,
    ).toBe(true);
  });

  it("assertName falls back to text content", () => {
    document.body.innerHTML = "<button id='d'>Delete</button>";
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const el = document.querySelector("#d")!;
    expect(
      assertName({ element: el, dom, runtimeId: "rt", confidence: "high" }, "Delete").passed,
    ).toBe(true);
  });
});

describe("assertConsoleClean", () => {
  it("passes when no entries", () => {
    expect(assertConsoleClean([]).passed).toBe(true);
  });

  it("passes with only log/info entries", () => {
    const entries: ConsoleEntry[] = [
      { level: "log", message: "hi", timestamp: 0 },
      { level: "info", message: "ok", timestamp: 1 },
    ];
    expect(assertConsoleClean(entries).passed).toBe(true);
  });

  it("fails on error entry", () => {
    const entries: ConsoleEntry[] = [{ level: "error", message: "boom", timestamp: 0 }];
    const result = assertConsoleClean(entries);
    expect(result.passed).toBe(false);
    expect(result.message).toContain("1 error/warning");
  });

  it("fails on warn entry", () => {
    const entries: ConsoleEntry[] = [{ level: "warn", message: "careful", timestamp: 0 }];
    expect(assertConsoleClean(entries).passed).toBe(false);
  });
});
