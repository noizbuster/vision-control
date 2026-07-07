/**
 * Target resolver tests: source-id lookup, role/name, selector, fingerprint,
 * and the repeated-instance disambiguation (wrong instance → null / correct).
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  createBrowserVerificationDomAdapter,
  resolveTarget,
  type VerificationDomAdapter,
} from "./index.js";

function makeDom(): VerificationDomAdapter {
  return createBrowserVerificationDomAdapter({ captureConsole: false });
}

describe("resolveTarget — source id strategy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves by data-vc-source with high confidence", async () => {
    document.body.innerHTML = "<div data-vc-source='src-abc' id='el'>Hello</div>";
    const dom = makeDom();
    const result = await resolveTarget("src-abc", { dom, hints: { sourceId: "src-abc" } });
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("high");
    expect(result?.sourceId).toBe("src-abc");
  });

  it("returns null when source id not found in DOM", async () => {
    document.body.innerHTML = "<div id='el'>Hello</div>";
    const dom = makeDom();
    const result = await resolveTarget("src-missing", { dom });
    expect(result).toBeNull();
  });

  it("disambiguates repeated instances by fingerprint (picks correct one)", async () => {
    // Two list items sharing the same source id but different fingerprints
    // (different ancestry/text).
    document.body.innerHTML = `
      <ul id='list-a'><li data-vc-source='li-src' id='item-1'>First</li></ul>
      <ul id='list-b'><li data-vc-source='li-src' id='item-2'>Second</li></ul>
    `;
    const dom = makeDom();
    const item2 = document.querySelector("#item-2");
    if (!item2) throw new Error("test setup: #item-2 not found");
    const fp2 = dom.computeFingerprint(item2);

    const result = await resolveTarget("li-src", {
      dom,
      hints: { sourceId: "li-src", fingerprint: fp2 },
    });
    expect(result).not.toBeNull();
    expect(result?.element.id).toBe("item-2");
  });

  it("returns null when fingerprint does not match any instance (stale DOM)", async () => {
    document.body.innerHTML = `
      <ul><li data-vc-source='li-src' id='item-1'>First</li></ul>
    `;
    const dom = makeDom();
    const result = await resolveTarget("li-src", {
      dom,
      hints: { sourceId: "li-src", fingerprint: "stale-fingerprint" },
    });
    expect(result).toBeNull();
  });

  it("picks by instanceIndex when no fingerprint provided", async () => {
    document.body.innerHTML = `
      <ul>
        <li data-vc-source='li-src'>A</li>
        <li data-vc-source='li-src' id='second'>B</li>
        <li data-vc-source='li-src'>C</li>
      </ul>
    `;
    const dom = makeDom();
    const result = await resolveTarget("li-src", { dom, instanceIndex: 1 });
    expect(result?.element.id).toBe("second");
  });
});

describe("resolveTarget — role/name strategy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves by role + aria-label with medium confidence", async () => {
    document.body.innerHTML = "<button role='tab' aria-label='Settings'>x</button>";
    const dom = makeDom();
    const result = await resolveTarget(undefined, {
      dom,
      hints: { role: "tab", name: "Settings" },
    });
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("medium");
  });

  it("returns null when role matches but name does not", async () => {
    document.body.innerHTML = "<button role='tab' aria-label='Other'>x</button>";
    const dom = makeDom();
    const result = await resolveTarget(undefined, {
      dom,
      hints: { role: "tab", name: "Settings" },
    });
    expect(result).toBeNull();
  });
});

describe("resolveTarget — selector strategy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves by stable selector with medium confidence", async () => {
    document.body.innerHTML = "<div id='target-el'>x</div>";
    const dom = makeDom();
    const result = await resolveTarget(undefined, {
      dom,
      hints: { selector: "#target-el" },
    });
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("medium");
    expect(result?.selector).toBe("#target-el");
  });

  it("returns null when selector matches nothing", async () => {
    document.body.innerHTML = "<div id='other'>x</div>";
    const dom = makeDom();
    const result = await resolveTarget(undefined, {
      dom,
      hints: { selector: "#target-el" },
    });
    expect(result).toBeNull();
  });
});

describe("resolveTarget — fingerprint strategy", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("resolves by fingerprint with low confidence", async () => {
    document.body.innerHTML = "<div id='fp-target' data-testid='widget'>x</div>";
    const dom = makeDom();
    const el = document.querySelector("#fp-target");
    if (!el) throw new Error("test setup: #fp-target not found");
    const fingerprint = dom.computeFingerprint(el);
    const result = await resolveTarget(undefined, {
      dom,
      hints: { fingerprint, tagName: "div" },
    });
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("low");
  });

  it("returns null when fingerprint matches nothing", async () => {
    document.body.innerHTML = "<div>x</div>";
    const dom = makeDom();
    const result = await resolveTarget(undefined, {
      dom,
      hints: { fingerprint: "nonexistent", tagName: "div" },
    });
    expect(result).toBeNull();
  });
});

describe("resolveTarget — priority cascade", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers source id over selector when both available", async () => {
    document.body.innerHTML = "<div data-vc-source='src-1' id='by-selector'>x</div>";
    const dom = makeDom();
    const result = await resolveTarget("src-1", {
      dom,
      hints: { sourceId: "src-1", selector: "#by-selector" },
    });
    expect(result?.confidence).toBe("high");
  });

  it("adapter fingerprint is deterministic and matches across calls", () => {
    document.body.innerHTML = "<div id='d' role='button' data-testid='t'>x</div>";
    const el = document.querySelector("#d");
    if (!el) throw new Error("test setup: #d not found");
    const adapter = makeDom();
    const fp1 = adapter.computeFingerprint(el);
    const fp2 = adapter.computeFingerprint(el);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{8}$/);
  });
});
