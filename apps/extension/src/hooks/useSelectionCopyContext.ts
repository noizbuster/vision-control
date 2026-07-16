import type { SelectionSummary } from "@vision-control/inspector-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { serializeSelectionCopyContext } from "../components/inspector/selection-copy-context.js";
import type { SelectionOriginState } from "./useSelectionSummary.js";

export type SelectionCopyStatus = "idle" | "resolving" | "copied" | "error";

export function useSelectionCopyContext(input: {
  readonly summary: SelectionSummary | null;
  readonly originState: SelectionOriginState;
  readonly pageUrl: string | null | undefined;
}): {
  readonly canCopySelectionContext: boolean;
  readonly selectionCopyStatus: SelectionCopyStatus;
  readonly handleCopySelectionContext: () => void;
} {
  const { summary, originState, pageUrl } = input;
  const attemptRef = useRef(0);
  const [outcome, setOutcome] = useState<"idle" | "copied" | "error">("idle");

  const readyOriginsMatchSelection =
    summary !== null &&
    originState.status === "ready" &&
    originState.runtimeId === summary.identity.runtimeId;

  const selectionCopyContext = useMemo(() => {
    if (!readyOriginsMatchSelection || summary === null || originState.status !== "ready") {
      return null;
    }
    return serializeSelectionCopyContext({
      pageUrl: pageUrl ?? null,
      selection: summary,
      origins: originState.origins,
      originsTruncated: originState.originsTruncated,
    });
  }, [originState, pageUrl, readyOriginsMatchSelection, summary]);

  useEffect(() => {
    attemptRef.current += 1;
    setOutcome("idle");
  }, [selectionCopyContext]);

  const handleCopySelectionContext = useCallback((): void => {
    if (selectionCopyContext === null) return;
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setOutcome("error");
      return;
    }

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    void clipboard.writeText(selectionCopyContext).then(
      () => {
        if (attemptRef.current !== attempt) return;
        setOutcome("copied");
      },
      () => {
        if (attemptRef.current !== attempt) return;
        setOutcome("error");
      },
    );
  }, [selectionCopyContext]);

  const selectionCopyStatus: SelectionCopyStatus =
    originState.status === "pending" &&
    summary !== null &&
    originState.runtimeId === summary.identity.runtimeId
      ? "resolving"
      : outcome;

  return {
    canCopySelectionContext: selectionCopyContext !== null,
    selectionCopyStatus,
    handleCopySelectionContext,
  };
}
