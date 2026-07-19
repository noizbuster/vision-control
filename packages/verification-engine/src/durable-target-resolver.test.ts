import { beforeEach, describe, expect, it } from "vitest";

import { createBrowserVerificationDomAdapter } from "./dom-adapter.js";
import { resolveDurableElement } from "./durable-target-resolver.js";
import { resolveTarget } from "./target-resolver.js";

describe("durable target resolution", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="card" data-vc-source="neighbor-src" data-vc-runtime-id="new-neighbor"></div>
      <div class="card" data-vc-source="primary-src" data-vc-runtime-id="new-primary"></div>
      <div class="card" data-vc-source="witness-src" data-vc-runtime-id="new-witness"></div>
    `;
  });

  it("selects occurrence before confirming a shared fingerprint", async () => {
    const browser = createBrowserVerificationDomAdapter({ captureConsole: false });
    const dom = { ...browser, computeFingerprint: () => "shared-fp" };
    const target = await resolveTarget("primary-src", {
      dom,
      hints: {
        selector: ".card",
        occurrence: 1,
        fingerprint: "shared-fp",
        sourceId: "primary-src",
      },
    });
    expect(target?.runtimeId).toBe("new-primary");
  });

  it("does not treat a source marker alone as HIGH confidence", async () => {
    // Given: only the opaque development marker can reacquire the element.
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });

    // When: target resolution uses that marker.
    const target = await resolveTarget("primary-src", { dom });

    // Then: identity is preserved without claiming map-plus-range evidence.
    expect(target).toMatchObject({
      runtimeId: "new-primary",
      sourceId: "primary-src",
      confidence: "medium",
    });
  });

  it("does not treat a source marker plus fingerprint as HIGH confidence", async () => {
    // Given: a marker match is disambiguated by the captured fingerprint.
    const browser = createBrowserVerificationDomAdapter({ captureConsole: false });
    const dom = { ...browser, computeFingerprint: () => "primary-fp" };

    // When: target resolution uses both identity hints.
    const target = await resolveTarget("primary-src", {
      dom,
      hints: { fingerprint: "primary-fp" },
    });

    // Then: the marker remains useful but cannot manufacture HIGH confidence.
    expect(target).toMatchObject({
      runtimeId: "new-primary",
      sourceId: "primary-src",
      confidence: "medium",
    });
  });

  it("keeps source id as a durable hint without treating it as HIGH confidence", async () => {
    // Given: selector occurrence, fingerprint, and marker identify one durable element.
    const browser = createBrowserVerificationDomAdapter({ captureConsole: false });
    const dom = { ...browser, computeFingerprint: () => "shared-fp" };

    // When: the durable occurrence path reacquires the target after DOM replacement.
    const target = await resolveTarget("primary-src", {
      dom,
      hints: {
        selector: ".card",
        occurrence: 1,
        fingerprint: "shared-fp",
        sourceId: "primary-src",
      },
    });

    // Then: sourceId survives as identity metadata without qualifying as HIGH evidence.
    expect(target).toMatchObject({
      runtimeId: "new-primary",
      sourceId: "primary-src",
      confidence: "medium",
    });
  });

  it("does not substitute another source-id match for the selected occurrence", async () => {
    const browser = createBrowserVerificationDomAdapter({ captureConsole: false });
    const dom = { ...browser, computeFingerprint: () => "shared-fp" };
    const target = await resolveTarget("neighbor-src", {
      dom,
      hints: {
        selector: ".card",
        occurrence: 1,
        fingerprint: "shared-fp",
        sourceId: "neighbor-src",
      },
    });
    expect(target).toBeNull();
  });

  it("rejects malformed and out-of-range occurrences", () => {
    const dom = createBrowserVerificationDomAdapter({ captureConsole: false });
    const malformed = resolveDurableElement(dom, {
      selector: ".card",
      occurrence: -1,
      fingerprint: "shared-fp",
    });
    const outOfRange = resolveDurableElement(dom, {
      selector: ".card",
      occurrence: 8,
      fingerprint: "shared-fp",
    });
    expect(malformed.kind === "failed" ? malformed.reason : "resolved").toBe("invalid-occurrence");
    expect(outOfRange.kind === "failed" ? outOfRange.reason : "resolved").toBe(
      "occurrence-out-of-range",
    );
  });

  it("rejects an adapter that returns one element as multiple candidates", () => {
    const browser = createBrowserVerificationDomAdapter({ captureConsole: false });
    const element = document.querySelector(".card");
    if (element === null) throw new Error("test setup: card missing");
    const dom = {
      ...browser,
      querySelectorAll: () => [element, element],
      computeFingerprint: () => "shared-fp",
    };
    const result = resolveDurableElement(dom, {
      selector: ".card",
      occurrence: 0,
      fingerprint: "shared-fp",
    });
    expect(result.kind === "failed" ? result.reason : "resolved").toBe("ambiguous-candidate");
  });
});
