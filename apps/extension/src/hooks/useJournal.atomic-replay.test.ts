import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeFlexResizeOperation } from "../journal/flex-resize-operation.test-fixture.js";
import { useJournal } from "./useJournal.js";
import { makeFakePreviewManager } from "./useJournal.test-fixtures.js";

describe("useJournal atomic preview replay", () => {
  it("keeps aggregate Undo committed when its preview transaction cannot commit", () => {
    const pair = makeFlexResizeOperation();
    const { manager, state, failNextCommit } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => result.current.record(pair));
    failNextCommit();

    act(() => result.current.undo());

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.entries[0]?.status).toBe("committed");
    expect(state().applied).toEqual([pair]);
    const attemptedInverse = state().attempted[1];
    expect(attemptedInverse?.kind).toBe("resize-flex-pair");
    if (attemptedInverse?.kind !== "resize-flex-pair") return;
    expect(attemptedInverse.members[0].after).toEqual(pair.members[0].before);
    expect(attemptedInverse.members[1].after).toEqual(pair.members[1].before);
  });

  it("keeps aggregate Redo reverted when its preview transaction cannot apply", () => {
    const pair = makeFlexResizeOperation();
    const { manager, state, failNextApply } = makeFakePreviewManager();
    const { result } = renderHook(() => useJournal({ previewEngine: manager }));
    act(() => result.current.record(pair));
    act(() => result.current.undo());
    failNextApply();

    act(() => result.current.redo());

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(result.current.entries[0]?.status).toBe("reverted");
    expect(state().applied).toHaveLength(2);
    expect(state().attempted[2]).toEqual(pair);
  });
});
