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
import { createSelectionSummaryFixture } from "../../testing/selection-summary-fixture.js";
import {
  createClearPreviewMessage,
  createEditorCommandMessage,
  createHostAccessChangedMessage,
  createSelectionOriginsClearedMessage,
  createSelectionOriginsMessage,
  createSelectionSummaryClearedMessage,
  createSelectionSummaryMessage,
} from "../panel-messages.js";

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

describe("createHostAccessChangedMessage", () => {
  it("targets the background without tab-specific routing", () => {
    const message = createHostAccessChangedMessage();
    expect(message.messageType).toBe("host-access-changed");
    expect(message.targetRoute).toBe("background");
    expect(message.tabId).toBeUndefined();
    expect("tabId" in message).toBe(false);
  });
});

describe("selection correlation messages", () => {
  it("keeps selection-summary payload unchanged and carries revision on the envelope", () => {
    const summary = createSelectionSummaryFixture();

    const message = createSelectionSummaryMessage(summary, 3);

    expect(message.payload).toBe(summary);
    expect(message.selectionRevision).toBe(3);
  });

  it("correlates clear and origins messages through the envelope revision", () => {
    const clear = createSelectionSummaryClearedMessage(4);
    const originsClear = createSelectionOriginsClearedMessage(5);
    const origins = createSelectionOriginsMessage(
      {
        runtimeId: "runtime-1",
        origins: [{ relativePath: "src/Button.tsx", confidence: "high", warnings: [] }],
        originsTruncated: true,
      },
      4,
    );

    expect(clear.payload).toBeNull();
    expect(clear.selectionRevision).toBe(4);
    expect(origins.messageType).toBe("selection-origins");
    expect(origins.selectionRevision).toBe(4);
    expect(origins.payload).toEqual({
      runtimeId: "runtime-1",
      origins: [{ relativePath: "src/Button.tsx", confidence: "high", warnings: [] }],
      originsTruncated: true,
    });
    expect(originsClear.messageType).toBe("selection-origins");
    expect(originsClear.selectionRevision).toBe(5);
    expect(originsClear.payload).toBeNull();
  });
});
