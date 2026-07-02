import { type Journal, JournalSchema } from "./journal.js";

/**
 * Result of parsing a serialized journal. Mirrors the parse-result shape used
 * across the workspace (e.g. `@vision-control/change-ir` deserialize): success
 * carries the typed value, failure carries a structured error. Never throws.
 */
export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ParseError };

export interface ParseError {
  readonly message: string;
  readonly issues: unknown;
}

/**
 * Serialize a journal to a deterministic JSON string. The input is validated
 * through {@link JournalSchema} first, so the output keys follow stable schema
 * insertion order regardless of how the caller constructed the object —
 * snapshot-friendly. Never throws on a valid Journal.
 */
export const serializeJournal = (journal: Journal): string =>
  JSON.stringify(JournalSchema.parse(journal));

/**
 * Deserialize a JSON string into a typed Journal. Never throws: invalid JSON or
 * schema failures return a `{ success: false, error }` result. The full journal
 * state — entries, undo/redo stacks, commit status — survives the round-trip
 * because every field is a regular schema field.
 */
export const deserializeJournal = (input: string): ParseResult<Journal> => {
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
  const result = JournalSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: { message: "Journal validation failed", issues: result.error.issues },
    };
  }
  return { success: true, data: result.data };
};
