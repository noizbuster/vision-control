import { z } from "zod";

/**
 * Pointer ownership invariant (PRD section 10): "at most one pointer-owning
 * interaction is active at a time". A drag and a resize both own a pointer; the
 * invariant forbids a second pointer-owning gesture from starting while one is
 * already in flight.
 *
 * This module is the single source of truth for "which gesture owns the
 * pointer right now". The state machine consults {@link acquirePointer} before
 * entering `dragging` or `resizing`; a rejected acquire is surfaced as a
 * `pointer-busy` transition error so the caller can log and ignore the event
 * rather than silently dropping it.
 */

/**
 * Branded pointer id: a stable identifier for a single active pointer (mouse
 * pointerId / touch identifier). At runtime it is just a string; the brand
 * keeps it distinct from arbitrary strings at the type level.
 */
export type PointerId = string & { readonly __brand: "PointerId" };

export const PointerIdSchema = z
  .string()
  .min(1)
  .transform((value) => value as PointerId);

/** Construct a branded pointer id from a raw string. Empty input is rejected. */
export const createPointerId = (raw: string): PointerId => {
  if (raw.length === 0) {
    throw new EmptyPointerIdError();
  }
  return raw as PointerId;
};

export class EmptyPointerIdError extends Error {
  public constructor() {
    super("PointerId must be a non-empty string");
    this.name = "EmptyPointerIdError";
  }
}

/** Which kind of pointer-owning gesture holds the pointer. */
export type PointerOwnerKind = "drag" | "resize";

export const PointerOwnerKindSchema = z.enum(["drag", "resize"]);

/** The currently active pointer owner, if any. */
export interface PointerOwner {
  readonly pointerId: PointerId;
  readonly owner: PointerOwnerKind;
}

export const PointerOwnerSchema = z.object({
  pointerId: PointerIdSchema,
  owner: PointerOwnerKindSchema,
});

/**
 * Ownership snapshot carried inside the machine context. Immutable: every
 * transition returns a new snapshot.
 */
export interface PointerOwnershipState {
  readonly activeOwner: PointerOwner | null;
}

export const PointerOwnershipStateSchema = z.object({
  activeOwner: PointerOwnerSchema.nullable(),
});

/** Sentinel for the no-owner state. */
export const NO_POINTER_OWNER: PointerOwnershipState = { activeOwner: null } as const;

export type AcquirePointerResult =
  | { readonly ok: true; readonly state: PointerOwnershipState }
  | {
      readonly ok: false;
      readonly reason: "pointer-busy";
      readonly current: PointerOwner;
      readonly attempted: PointerOwnerKind;
    };

/**
 * Try to claim the pointer for `owner`. Fails if a pointer-owning gesture is
 * already active — the invariant that forbids a resize while dragging (and
 * vice versa) lives here.
 */
export const acquirePointer = (
  state: PointerOwnershipState,
  pointerId: PointerId,
  owner: PointerOwnerKind,
): AcquirePointerResult => {
  if (state.activeOwner !== null) {
    return { ok: false, reason: "pointer-busy", current: state.activeOwner, attempted: owner };
  }
  return { ok: true, state: { activeOwner: { pointerId, owner } } };
};

/**
 * Release the pointer for `pointerId`. If the id does not match the active
 * owner, the snapshot is returned unchanged (a stray release is a no-op rather
 * than an error: the browser may emit extra pointer events).
 */
export const releasePointer = (
  state: PointerOwnershipState,
  pointerId: PointerId,
): PointerOwnershipState => {
  if (state.activeOwner !== null && state.activeOwner.pointerId === pointerId) {
    return NO_POINTER_OWNER;
  }
  return state;
};

export const isPointerBusy = (state: PointerOwnershipState): boolean => state.activeOwner !== null;
