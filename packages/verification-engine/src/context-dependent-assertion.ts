import type { AssertionResult } from "./types.js";

export function contextDependentNote(name: string, message: string): AssertionResult {
  return {
    name,
    passed: true,
    expected: "context-dependent",
    actual: "structural note",
    message,
  };
}
