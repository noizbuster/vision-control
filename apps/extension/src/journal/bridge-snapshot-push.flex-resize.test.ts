import type { BridgeClient } from "@vision-control/bridge-client";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  deserializeJournal,
  serializeJournal,
} from "@vision-control/change-journal";
import { describe, expect, it } from "vitest";

import { createBridgeSnapshotPushController } from "./bridge-snapshot-push.js";
import { makeFlexResizeOperation } from "./flex-resize-operation.test-fixture.js";

describe("bridge flex resize snapshot push", () => {
  it("projects one rehydrated aggregate operation to the paired client", () => {
    const operation = makeFlexResizeOperation();
    const journal = appendEntry(
      createJournal(),
      createJournalEntry({
        id: "je-flex-bridge-001",
        changeSetId: "cs-flex-bridge-001",
        transactionId: "tx-flex-bridge-001",
        sequence: 0,
        operation,
        status: "committed",
      }),
    );
    const restored = deserializeJournal(serializeJournal(journal));
    expect(restored.success).toBe(true);
    if (!restored.success) return;
    const pushes: Parameters<BridgeClient["pushSnapshot"]>[0][] = [];
    const client: Pick<BridgeClient, "state" | "pushSnapshot" | "clearTab" | "focusTab"> = {
      state: "connected",
      pushSnapshot: (input) => pushes.push(input),
      clearTab: () => undefined,
      focusTab: () => undefined,
    };
    const controller = createBridgeSnapshotPushController({
      getClient: () => client,
      getJournal: () => restored.data,
      getSessionId: () => "session-flex",
      now: () => operation.timestamp,
    });

    controller.pushForTab(42);

    expect(pushes).toHaveLength(1);
    const snapshot = pushes[0]?.snapshot;
    expect(snapshot).toMatchObject({
      formatVersion: "1.1.0",
      operations: [
        {
          kind: "resize-flex-pair",
          detail: {
            witnessCount: 1,
            members: [
              { element: { occurrence: 0, fingerprint: "fingerprint-0" } },
              { element: { occurrence: 1, fingerprint: "fingerprint-1" } },
            ],
          },
        },
      ],
    });
  });
});
