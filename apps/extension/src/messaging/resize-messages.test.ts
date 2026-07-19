import { describe, expect, it } from "vitest";

import {
  createFlexResizeStatusMessage,
  isFlexResizeStatus,
  isResizeCandidateSelectPayload,
} from "./resize-messages.js";

describe("resize candidate selection payload", () => {
  it("rejects unknown and non-string physical properties", () => {
    expect(isResizeCandidateSelectPayload({ kind: "css-property", property: "unknown" })).toBe(
      false,
    );
    expect(isResizeCandidateSelectPayload({ kind: "css-property", property: 1 })).toBe(false);
  });

  it("requires a physical property for css-property selections", () => {
    expect(isResizeCandidateSelectPayload({ kind: "css-property" })).toBe(false);
    expect(isResizeCandidateSelectPayload({ kind: "css-property", property: "height" })).toBe(true);
  });
});

describe("flex Resize status payload", () => {
  it("preserves valid, active, disabled-edge, and blocked status variants", () => {
    expect(isFlexResizeStatus({ kind: "valid" })).toBe(true);
    expect(isFlexResizeStatus({ kind: "active" })).toBe(true);
    expect(isFlexResizeStatus({ kind: "disabled-edge", message: "No neighbor" })).toBe(true);
    expect(isFlexResizeStatus({ kind: "blocked", message: "Wrapped items" })).toBe(true);
  });

  it("accepts status clearing and rejects malformed status payloads", () => {
    expect(isFlexResizeStatus(null)).toBe(true);
    expect(isFlexResizeStatus({ kind: "blocked" })).toBe(false);
    expect(isFlexResizeStatus({ kind: "unknown" })).toBe(false);
  });

  it("routes the typed status message to the panel", () => {
    const message = createFlexResizeStatusMessage({ kind: "active" });

    expect(message.targetRoute).toBe("panel");
    expect(message.messageType).toBe("flex-resize-status");
    expect(message.payload).toEqual({ kind: "active" });
  });
});
