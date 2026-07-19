import { beforeEach, describe, expect, it } from "vitest";

import { dispatchCommandKind, parseBridgeCommandPayload } from "./bridge-command-kinds.js";
import { candidateFromRef, runContentVerification } from "./content-verification.js";

function makePreview(active = 0): {
  activeCount: number;
  clearAll: () => void;
} {
  let count = active;
  return {
    get activeCount() {
      return count;
    },
    clearAll: () => {
      count = 0;
    },
  };
}

describe("parseBridgeCommandPayload / dispatchCommandKind", () => {
  it("parses clear_preview and request_verification", () => {
    const clear = parseBridgeCommandPayload({
      commandId: "c1",
      kind: "clear_preview",
      tabId: "7",
    });
    expect(clear?.kind).toBe("clear_preview");
    if (clear === undefined) throw new Error("expected clear_preview payload");
    expect(dispatchCommandKind(clear)).toEqual({ kind: "clear_preview" });

    const verify = parseBridgeCommandPayload({
      commandId: "c2",
      kind: "request_verification",
      operations: [{ id: "op-1", kind: "style-edit" }],
    });
    if (verify === undefined) throw new Error("expected request_verification payload");
    expect(dispatchCommandKind(verify).kind).toBe("request_verification");
  });

  it("rejects apply_patch kind", () => {
    expect(
      parseBridgeCommandPayload({
        commandId: "c3",
        kind: "apply_patch",
      }),
    ).toBeUndefined();
  });
});

describe("runContentVerification (C6 anti-cheat)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clears preview without treating empty operations as source proof", async () => {
    // Given
    const preview = makePreview(2);

    // When
    const outcome = await runContentVerification({
      operations: [],
      preview,
      skipHmrWait: true,
    });

    // Then
    expect(preview.activeCount).toBe(0);
    expect(outcome).toMatchObject({
      passed: false,
      details: {
        verdict: "fail",
        previewCleared: true,
        assertions: [
          { name: "preview-cleared", passed: true },
          { name: "source-intent-present", passed: false },
        ],
      },
    });
  });

  it("fails when preview cannot be cleared", async () => {
    const stuck = {
      activeCount: 1,
      clearAll: () => {
        /* intentionally stuck */
      },
    };
    const outcome = await runContentVerification({
      operations: [],
      preview: stuck,
      skipHmrWait: true,
    });
    expect(outcome.passed).toBe(false);
    expect(outcome.details.previewCleared).toBe(false);
  });

  it("passes style-edit after clear when DOM matches source", async () => {
    document.body.innerHTML =
      "<button data-vc-source='src-btn' id='save' style='color: rgb(255, 0, 0)'>Save</button>";
    const preview = makePreview(1);
    const op = {
      id: "op-style-00001",
      kind: "style-edit" as const,
      runtime: false,
      origin: "property-panel" as const,
      confidence: 1,
      timestamp: 0,
      target: {
        runtimeId: "rt-1",
        sourceId: "src-btn",
        selector: "#save",
      },
      property: "color",
      value: "rgb(255, 0, 0)",
      important: false,
    };
    const outcome = await runContentVerification({
      operations: [op],
      preview,
      skipHmrWait: true,
    });
    expect(preview.activeCount).toBe(0);
    expect(outcome.details.previewCleared).toBe(true);
    expect(outcome.passed).toBe(true);
  });
});

describe("candidateFromRef", () => {
  it("uses only a real fingerprint and never treats runtime identity as one", () => {
    expect(candidateFromRef({ sourceId: "src-1", selector: ".card" })).toEqual({
      sourceId: "src-1",
      selector: ".card",
    });
    expect(candidateFromRef({ fingerprint: "abc12345" })).toEqual({
      fingerprint: "abc12345",
    });
  });

  it("preserves selector occurrence for durable HMR identity", () => {
    expect(candidateFromRef({ selector: ".card", occurrence: 2, fingerprint: "shared" })).toEqual({
      selector: ".card",
      occurrence: 2,
      fingerprint: "shared",
    });
  });
});
