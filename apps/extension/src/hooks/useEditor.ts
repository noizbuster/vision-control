import type { Operation } from "@vision-control/change-ir";
import { useCallback, useState } from "react";

export type EditorMode = "style" | "class" | "text" | null;

export interface EditorState {
  readonly mode: EditorMode;
  /** Pending operations created by the current editing session. */
  readonly pending: readonly Operation[];
  /** Validation error for the active editor input, if any. */
  readonly validationError: string | null;
}

export interface EditorActions {
  readonly setMode: (mode: EditorMode) => void;
  readonly clearValidation: () => void;
  readonly setValidationError: (error: string | null) => void;
  readonly addPendingOperation: (operation: Operation) => void;
  readonly clearPending: () => void;
}

export interface UseEditorResult {
  readonly state: EditorState;
  readonly actions: EditorActions;
}

/**
 * Manage editor mode, pending operations, and validation state for the panel
 * editors. The hook does NOT send messages; callers pass operations to the bus.
 */
export function useEditor(): UseEditorResult {
  const [mode, setModeState] = useState<EditorMode>(null);
  const [pending, setPending] = useState<readonly Operation[]>([]);
  const [validationError, setValidationErrorState] = useState<string | null>(null);

  const setMode = useCallback((next: EditorMode): void => {
    setModeState(next);
    setValidationErrorState(null);
  }, []);

  const clearValidation = useCallback((): void => {
    setValidationErrorState(null);
  }, []);

  const setValidationError = useCallback((error: string | null): void => {
    setValidationErrorState(error);
  }, []);

  const addPendingOperation = useCallback((operation: Operation): void => {
    setPending((current) => [...current, operation]);
  }, []);

  const clearPending = useCallback((): void => {
    setPending([]);
  }, []);

  return {
    state: { mode, pending, validationError },
    actions: {
      setMode,
      clearValidation,
      setValidationError,
      addPendingOperation,
      clearPending,
    },
  };
}
