import { type ChangeSet, ChangeSetSchema } from "./changeset.js";

/**
 * Self-contained parse-result shape (mirrors the protocol's ParseResult). Not
 * imported from `@vision-control/protocol` to keep change-ir dependency-free
 * of other workspace packages.
 */
export type DeserializeResult =
  | { readonly success: true; readonly data: ChangeSet }
  | { readonly success: false; readonly error: DeserializeError };

export interface DeserializeError {
  readonly message: string;
  readonly issues: unknown;
}

/**
 * Serialize a ChangeSet to a deterministic JSON string. The input is validated
 * through {@link ChangeSetSchema} first, so the output keys follow stable
 * schema insertion order regardless of how the caller constructed the object —
 * snapshot-friendly. Never throws on valid ChangeSets.
 */
export const serializeChangeSet = (cs: ChangeSet): string =>
  JSON.stringify(ChangeSetSchema.parse(cs));

/**
 * Deserialize a JSON string into a typed ChangeSet. Never throws: invalid JSON
 * or schema failures return a `{ success: false, error }` result. The `runtime`
 * anti-cheat flag on each operation survives the round-trip because it is a
 * regular schema field.
 */
export const deserializeChangeSet = (input: string): DeserializeResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    return {
      success: false,
      error: {
        message: "Invalid JSON",
        issues: err instanceof Error ? err.message : String(err),
      },
    };
  }
  const result = ChangeSetSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: { message: "ChangeSet validation failed", issues: result.error.issues },
    };
  }
  return { success: true, data: result.data };
};
