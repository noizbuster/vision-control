import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import {
  createInteractionOperationRecorder,
  type InteractionOperationRecorderBus,
} from "./interaction-operation-recorder.js";

const operation: Operation = {
  id: "style-op",
  timestamp: 0,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "style-edit",
  target: { runtimeId: "target" },
  property: "color",
  value: "red",
  important: false,
  previousValue: "blue",
};

const inertBus = (): InteractionOperationRecorderBus => ({
  send: () => {},
  on: () => () => {},
});

describe("InteractionOperationRecorder", () => {
  it("does not publish local state when the applied callback throws", () => {
    const recorder = createInteractionOperationRecorder({
      bus: inertBus(),
      onOperationApplied: () => {
        throw new Error("sync failed");
      },
    });

    expect(() => recorder.record(operation)).toThrow("sync failed");
    expect(recorder.getRecordedOperations()).toEqual([]);
    expect(recorder.getJournal().entries).toEqual([]);
  });

  it("does not advance journal sequence when synchronous background send throws", () => {
    let sends = 0;
    let throwOnOperation = true;
    const bus: InteractionOperationRecorderBus = {
      send: () => {
        sends += 1;
        if (sends > 1 && throwOnOperation) throw new Error("background unavailable");
      },
      on: () => () => {},
    };
    const recorder = createInteractionOperationRecorder({ bus });

    expect(() => recorder.record(operation)).toThrow("background unavailable");
    expect(recorder.getRecordedOperations()).toEqual([]);
    expect(recorder.getJournal().entries).toEqual([]);

    throwOnOperation = false;
    recorder.record(operation);
    expect(recorder.getRecordedOperations()).toEqual([operation]);
    expect(recorder.getJournal().entries).toMatchObject([{ sequence: 0, operation }]);
  });
});
