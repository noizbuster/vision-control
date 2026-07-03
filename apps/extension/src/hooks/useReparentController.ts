import type { Operation } from "@vision-control/change-ir";
import type { PreviewManager } from "@vision-control/preview-engine";
import { useCallback, useMemo, useState } from "react";

import {
  createReparentController,
  type ReparentController,
  type ReparentControllerState,
  type ReparentHighlightState,
} from "../components/interaction/index.js";

export interface UseReparentControllerOptions {
  readonly previewEngine?: PreviewManager | null;
  readonly journal?: {
    readonly record: (operation: Operation) => void;
  } | null;
}

export interface UseReparentControllerResult {
  readonly state: ReparentControllerState;
  readonly highlight: ReparentHighlightState | null;
  readonly controller: ReparentController;
}

export function useReparentController(
  options: UseReparentControllerOptions = {},
): UseReparentControllerResult {
  const { previewEngine = null, journal = null } = options;
  const [state, setState] = useState<ReparentControllerState>(() => ({
    phase: "drag-pending",
    isActive: false,
    feasibility: {
      canReparent: false,
      sourcePatch: "agent-required",
      confidence: "low",
      risks: [{ kind: "content-model", reason: "No drop target evaluated yet" }],
    },
    highlight: null,
    lastResult: null,
  }));
  const [highlight, setHighlight] = useState<ReparentHighlightState | null>(null);

  const recordOperation = useCallback(
    (operation: Operation): void => {
      journal?.record(operation);
    },
    [journal],
  );

  const controller = useMemo<ReparentController>(() => {
    return createReparentController({
      callbacks: {
        onStateChange: setState,
        onHighlight: setHighlight,
      },
      previewEngine,
      journal: { record: recordOperation },
    });
  }, [previewEngine, recordOperation]);

  return { state, highlight, controller };
}
