import type { ElementRef, MultiSelectMember } from "@vision-control/element-identity";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import { describe, expect, it } from "vitest";

import {
  createInitialMultiSelectState,
  type MultiSelectEffect,
  type MultiSelectEvent,
  type MultiSelectReducerOptions,
  type MultiSelectState,
  transitionMultiSelect,
} from "./multi-select-transitions.js";

const member = (
  runtimeId: string,
  additions: Partial<Omit<MultiSelectMember, "runtimeId">> = {},
): MultiSelectMember => ({
  runtimeId,
  tagName: "div",
  frameId: "main",
  frameKind: "top",
  shadowKind: "light-dom",
  ...additions,
});

const ref = (runtimeId: string): ElementRef => ({ runtimeId, tagName: "div" });

/** Deterministic group id allocator so tests assert stable ids (flaky-class). */
const deterministicIds = (...ids: string[]): MultiSelectReducerOptions => {
  let i = 0;
  return { generateGroupId: () => createMultiSelectGroupId(ids[i++] ?? "grp-fallback") };
};

const findEffect = (effects: readonly MultiSelectEffect[], kind: MultiSelectEffect["kind"]) =>
  effects.find((e) => e.kind === kind);

describe("transitionMultiSelect — initial state", () => {
  it("starts with no group", () => {
    const state = createInitialMultiSelectState();
    expect(state.group).toBeNull();
  });
});

describe("transitionMultiSelect — shift-click add/remove", () => {
  it("first shift-click does not yet form a group (needs >= 2 members)", () => {
    const result = transitionMultiSelect(
      createInitialMultiSelectState(),
      {
        type: "shift-click",
        member: member("r1"),
        memberRect: { x: 0, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      deterministicIds("grp-0001"),
    );
    // A single member cannot form a group; the reducer holds the pending member
    // and emits no outline yet.
    expect(result.state.group).toBeNull();
    expect(findEffect(result.effects, "show-multi-outline")).toBeUndefined();
  });

  it("second shift-click forms a group of two and shows the outline", () => {
    const opts = deterministicIds("grp-0001");
    let state = createInitialMultiSelectState();
    state = transitionMultiSelect(
      state,
      {
        type: "shift-click",
        member: member("r1"),
        memberRect: { x: 0, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      opts,
    ).state;
    const result = transitionMultiSelect(
      state,
      {
        type: "shift-click",
        member: member("r2"),
        memberRect: { x: 20, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      opts,
    );
    expect(result.state.group).not.toBeNull();
    expect(result.state.group?.id).toBe("grp-0001");
    expect(result.state.group?.members.map((m) => m.runtimeId)).toEqual(["r1", "r2"]);
    expect(findEffect(result.effects, "show-multi-outline")).toBeDefined();
  });

  it("shift-click on an existing member removes it (toggle)", () => {
    const opts = deterministicIds("grp-0001");
    let state = createInitialMultiSelectState();
    for (const id of ["r1", "r2", "r3"]) {
      state = transitionMultiSelect(
        state,
        {
          type: "shift-click",
          member: member(id),
          memberRect: { x: 0, y: 0, width: 10, height: 10 },
          parentChain: [ref("body")],
        },
        opts,
      ).state;
    }
    expect(state.group?.members.map((m) => m.runtimeId)).toEqual(["r1", "r2", "r3"]);
    // Remove r2.
    const result = transitionMultiSelect(
      state,
      {
        type: "shift-click",
        member: member("r2"),
        memberRect: { x: 0, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      opts,
    );
    expect(result.state.group?.members.map((m) => m.runtimeId)).toEqual(["r1", "r3"]);
  });

  it("removing down to one member clears the group and hides the outline", () => {
    const opts = deterministicIds("grp-0001");
    let state = createInitialMultiSelectState();
    for (const id of ["r1", "r2"]) {
      state = transitionMultiSelect(
        state,
        {
          type: "shift-click",
          member: member(id),
          memberRect: { x: 0, y: 0, width: 10, height: 10 },
          parentChain: [ref("body")],
        },
        opts,
      ).state;
    }
    const result = transitionMultiSelect(
      state,
      {
        type: "shift-click",
        member: member("r2"),
        memberRect: { x: 0, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      opts,
    );
    expect(result.state.group).toBeNull();
    expect(findEffect(result.effects, "hide-multi-outline")).toBeDefined();
  });

  it("shift-click that would mix frames is rejected with a diagnostic, not silently added (misleading_success_output)", () => {
    const opts = deterministicIds("grp-0001");
    let state = createInitialMultiSelectState();
    state = transitionMultiSelect(
      state,
      {
        type: "shift-click",
        member: member("r1", { frameId: "main", frameKind: "top" }),
        memberRect: { x: 0, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      opts,
    ).state;
    const result = transitionMultiSelect(
      state,
      {
        type: "shift-click",
        member: member("r2", { frameId: "frame-2", frameKind: "same-origin-iframe" }),
        memberRect: { x: 20, y: 0, width: 10, height: 10 },
        parentChain: [ref("body")],
      },
      opts,
    );
    // The group is NOT formed; a multi-select-error effect carries the diagnostic.
    expect(result.state.group).toBeNull();
    const err = findEffect(result.effects, "multi-select-error");
    expect(err).toBeDefined();
    if (err?.kind === "multi-select-error") {
      expect(err.violations.some((v) => v.code === "cross-frame")).toBe(true);
    }
  });
});

describe("transitionMultiSelect — marquee-select", () => {
  it("forms a group from all members intersecting the rectangle", () => {
    const result = transitionMultiSelect(
      createInitialMultiSelectState(),
      {
        type: "marquee-select",
        members: [member("a"), member("b"), member("c")],
        memberRects: [
          { x: 0, y: 0, width: 10, height: 10 },
          { x: 20, y: 0, width: 10, height: 10 },
          { x: 40, y: 0, width: 10, height: 10 },
        ],
        parentChains: [[ref("body")], [ref("body")], [ref("body")]],
      },
      deterministicIds("grp-marquee"),
    );
    expect(result.state.group).not.toBeNull();
    expect(result.state.group?.members.map((m) => m.runtimeId)).toEqual(["a", "b", "c"]);
    expect(result.state.group?.boundingRect).toEqual({ x: 0, y: 0, width: 50, height: 10 });
    expect(findEffect(result.effects, "show-multi-outline")).toBeDefined();
  });

  it("rejects a marquee containing cross-frame members with a diagnostic", () => {
    const result = transitionMultiSelect(
      createInitialMultiSelectState(),
      {
        type: "marquee-select",
        members: [
          member("a", { frameId: "main" }),
          member("b", { frameId: "frame-2", frameKind: "same-origin-iframe" }),
        ],
        memberRects: [
          { x: 0, y: 0, width: 10, height: 10 },
          { x: 20, y: 0, width: 10, height: 10 },
        ],
        parentChains: [[ref("body")], [ref("body")]],
      },
      deterministicIds("grp-marquee"),
    );
    expect(result.state.group).toBeNull();
    const err = findEffect(result.effects, "multi-select-error");
    expect(err).toBeDefined();
  });

  it("a marquee with fewer than 2 members does not form a group (silent pending, not an error)", () => {
    const result = transitionMultiSelect(
      createInitialMultiSelectState(),
      {
        type: "marquee-select",
        members: [member("a")],
        memberRects: [{ x: 0, y: 0, width: 10, height: 10 }],
        parentChains: [[ref("body")]],
      },
      deterministicIds("grp-marquee"),
    );
    expect(result.state.group).toBeNull();
    expect(findEffect(result.effects, "multi-select-error")).toBeUndefined();
  });
});

describe("transitionMultiSelect — group-commit and group-clear", () => {
  it("group-commit emits a commit effect carrying the group", () => {
    const opts = deterministicIds("grp-0001");
    let state: MultiSelectState = createInitialMultiSelectState();
    for (const id of ["r1", "r2"]) {
      state = transitionMultiSelect(
        state,
        {
          type: "shift-click",
          member: member(id),
          memberRect: { x: 0, y: 0, width: 10, height: 10 },
          parentChain: [ref("body")],
        },
        opts,
      ).state;
    }
    const result = transitionMultiSelect(state, { type: "group-commit" }, opts);
    const commit = findEffect(result.effects, "commit-multi-select-group");
    expect(commit).toBeDefined();
    if (commit?.kind === "commit-multi-select-group") {
      expect(commit.group.id).toBe("grp-0001");
    }
  });

  it("group-commit with no group is an error", () => {
    const result = transitionMultiSelect(createInitialMultiSelectState(), { type: "group-commit" });
    expect(result.state.group).toBeNull();
    expect(findEffect(result.effects, "multi-select-error")).toBeDefined();
  });

  it("group-clear removes the group and hides the outline", () => {
    const opts = deterministicIds("grp-0001");
    let state: MultiSelectState = createInitialMultiSelectState();
    for (const id of ["r1", "r2"]) {
      state = transitionMultiSelect(
        state,
        {
          type: "shift-click",
          member: member(id),
          memberRect: { x: 0, y: 0, width: 10, height: 10 },
          parentChain: [ref("body")],
        },
        opts,
      ).state;
    }
    const result = transitionMultiSelect(state, { type: "group-clear" });
    expect(result.state.group).toBeNull();
    expect(findEffect(result.effects, "hide-multi-outline")).toBeDefined();
  });

  it("group-clear with no group is a no-op (no error)", () => {
    const result = transitionMultiSelect(createInitialMultiSelectState(), { type: "group-clear" });
    expect(result.effects).toEqual([]);
  });
});

describe("transitionMultiSelect — unknown event", () => {
  it("an unrecognized event is a no-op returning the unchanged state", () => {
    const state = createInitialMultiSelectState();
    // Exhaustiveness: the union has no other members, so cast a probe.
    const event = { type: "nonsense" } as unknown as MultiSelectEvent;
    const result = transitionMultiSelect(state, event);
    expect(result.state).toBe(state);
    expect(result.effects).toEqual([]);
  });
});
