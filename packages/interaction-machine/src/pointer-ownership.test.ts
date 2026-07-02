import { describe, expect, it } from "vitest";

import {
  acquirePointer,
  createPointerId,
  isPointerBusy,
  NO_POINTER_OWNER,
  releasePointer,
} from "./index.js";

describe("pointer-ownership invariant", () => {
  it("acquires the pointer when none is active", () => {
    const pid = createPointerId("ptr-1");
    const result = acquirePointer(NO_POINTER_OWNER, pid, "drag");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.activeOwner).toEqual({ pointerId: pid, owner: "drag" });
    }
  });

  it("rejects a second acquire while a pointer is owned (drag while resize busy)", () => {
    const resizePid = createPointerId("resize-ptr");
    const dragPid = createPointerId("drag-ptr");
    const owned = acquirePointer(NO_POINTER_OWNER, resizePid, "resize");
    if (!owned.ok) throw new Error("expected first acquire to succeed");
    const second = acquirePointer(owned.state, dragPid, "drag");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("pointer-busy");
      expect(second.current).toEqual({ pointerId: resizePid, owner: "resize" });
      expect(second.attempted).toBe("drag");
    }
  });

  it("isPointerBusy reflects ownership", () => {
    const pid = createPointerId("ptr-1");
    expect(isPointerBusy(NO_POINTER_OWNER)).toBe(false);
    const owned = acquirePointer(NO_POINTER_OWNER, pid, "drag");
    if (!owned.ok) throw new Error("acquire failed");
    expect(isPointerBusy(owned.state)).toBe(true);
  });

  it("releasePointer clears ownership for the matching id", () => {
    const pid = createPointerId("ptr-1");
    const owned = acquirePointer(NO_POINTER_OWNER, pid, "drag");
    if (!owned.ok) throw new Error("acquire failed");
    const released = releasePointer(owned.state, pid);
    expect(released.activeOwner).toBeNull();
  });

  it("releasePointer is a no-op for a non-matching id", () => {
    const pid = createPointerId("ptr-1");
    const other = createPointerId("ptr-2");
    const owned = acquirePointer(NO_POINTER_OWNER, pid, "drag");
    if (!owned.ok) throw new Error("acquire failed");
    const released = releasePointer(owned.state, other);
    expect(released.activeOwner).toEqual({ pointerId: pid, owner: "drag" });
  });

  it("createPointerId rejects an empty string", () => {
    expect(() => createPointerId("")).toThrow();
  });
});
