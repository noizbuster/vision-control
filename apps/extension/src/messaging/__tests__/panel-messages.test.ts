/**
 * Shape contract for panel->background edit messages.
 *
 * The edit forwarder (edit-forwarding.ts) requires `message.tabId` to route an
 * edit to the content frame; without it the edit is silently dropped. These
 * tests pin the factory contract: `tabId` IS serialised onto the message when
 * the panel passes it, and is OMITTED (not `undefined`, absent entirely) when
 * the panel does not — which is exactly the condition that makes the
 * background sender-fallback necessary.
 */

import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import { createClearPreviewMessage, createEditorCommandMessage } from "../panel-messages.js";

const BASE_TIME = 1_700_000_000_000;

const operation: Operation = {
  id: "op-shape-001",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "style-edit",
  target: { runtimeId: "el-1" },
  property: "color",
  value: "red",
  previousValue: "black",
  important: false,
};

describe("createEditorCommandMessage", () => {
  it("stamps tabId onto the message when the panel passes it", () => {
    const message = createEditorCommandMessage(operation, 42);
    expect(message.messageType).toBe("editor-command");
    expect(message.targetRoute).toBe("background");
    expect(message.tabId).toBe(42);
    expect("tabId" in message).toBe(true);
    expect(message.payload).toBe(operation);
  });

  it("omits tabId entirely when the panel does not pass it", () => {
    const message = createEditorCommandMessage(operation);
    expect(message.messageType).toBe("editor-command");
    expect(message.tabId).toBeUndefined();
    // The key must be absent (not present-with-undefined) so the background
    // sender-fallback is the only recovery path.
    expect("tabId" in message).toBe(false);
  });
});

describe("createClearPreviewMessage", () => {
  it("stamps tabId onto the message when the panel passes it", () => {
    const message = createClearPreviewMessage(7);
    expect(message.messageType).toBe("clear-preview");
    expect(message.targetRoute).toBe("background");
    expect(message.tabId).toBe(7);
    expect("tabId" in message).toBe(true);
  });

  it("omits tabId entirely when the panel does not pass it", () => {
    const message = createClearPreviewMessage();
    expect(message.messageType).toBe("clear-preview");
    expect(message.tabId).toBeUndefined();
    expect("tabId" in message).toBe(false);
  });
});
