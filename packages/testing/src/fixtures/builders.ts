/**
 * Generic fixture builders for upcoming core models. The real Change IR /
 * element-identity schemas land in later tasks; these builders produce typed
 * partial records with sensible defaults so tests can construct inputs without
 * hand-rolling every field.
 *
 * When the real schemas arrive, replace the `*Like` shapes with the typed
 * domain models and keep the builder signatures stable.
 */

/** Merge `overrides` over `defaults`, returning a complete record. */
export function buildRecord<T extends object>(defaults: T, overrides?: Partial<T>): T {
  const merged = { ...defaults, ...(overrides ?? {}) };
  // Structural merge is always a valid `T`; the cast documents that intent.
  return merged as T;
}

/** Minimal operation stub for the changeset builder. */
export interface OperationStub {
  readonly type: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** Forward-looking changeset shape (real schema: change-ir package). */
export interface ChangesetLike {
  readonly id: string;
  readonly ops: readonly OperationStub[];
  readonly timestamp: number;
}

/** Forward-looking element identity shape (real schema: element-identity package). */
export interface SelectionIdentityLike {
  readonly sourceId: string;
  readonly role: string;
  readonly xpath: string;
  readonly runtimeId: string;
}

/** Build a changeset with default id/timestamp and the given operations. */
export function buildChangeset(
  ops: readonly OperationStub[] = [],
  overrides?: Partial<ChangesetLike>,
): ChangesetLike {
  return buildRecord<ChangesetLike>({ id: "cs-0001", ops, timestamp: 0 }, overrides);
}

/** Build a selection identity with defaults mirroring a simple button. */
export function buildSelectionIdentity(
  overrides?: Partial<SelectionIdentityLike>,
): SelectionIdentityLike {
  return buildRecord<SelectionIdentityLike>(
    {
      sourceId: "src-1",
      role: "button",
      xpath: "/html/body/div/button",
      runtimeId: "r-1",
    },
    overrides,
  );
}
