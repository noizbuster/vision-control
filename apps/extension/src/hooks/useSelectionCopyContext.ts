import type { SelectionSummary } from "@vision-control/inspector-core";
import { useCallback, useMemo, useRef, useState } from "react";
import { serializeSelectionCopyContext } from "../components/inspector/selection-copy-context.js";
import type { SelectionOriginState } from "./useSelectionSummary.js";

export type SelectionCopyStatus = "idle" | "resolving" | "copied" | "error";

interface SelectionCopyOutcome {
  readonly summary: SelectionSummary;
  readonly pageUrl: string | null | undefined;
  readonly status: "copied" | "error";
}

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
  const [outcome, setOutcome] = useState<SelectionCopyOutcome | null>(null);
  const currentSummaryRef = useRef(summary);
  const currentPageUrlRef = useRef(pageUrl);
  currentSummaryRef.current = summary;
  currentPageUrlRef.current = pageUrl;

  const readyOriginsMatchSelection =
    summary !== null &&
    originState.status === "ready" &&
    originState.runtimeId === summary.identity.runtimeId;

  const selectionCopyContext = useMemo(() => {
    if (summary === null) return null;
    return serializeSelectionCopyContext({
      pageUrl: pageUrl ?? null,
      selection: summary,
      origins:
        readyOriginsMatchSelection && originState.status === "ready" ? originState.origins : [],
      originsTruncated:
        readyOriginsMatchSelection && originState.status === "ready"
          ? originState.originsTruncated
          : false,
    });
  }, [originState, pageUrl, readyOriginsMatchSelection, summary]);

  const handleCopySelectionContext = useCallback((): void => {
    if (selectionCopyContext === null || summary === null) return;
    const copiedSummary = summary;
    const copiedPageUrl = pageUrl;
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setOutcome({ summary: copiedSummary, pageUrl: copiedPageUrl, status: "error" });
      return;
    }

    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    void clipboard.writeText(selectionCopyContext).then(
      () => {
        if (
          attemptRef.current !== attempt ||
          currentSummaryRef.current !== copiedSummary ||
          currentPageUrlRef.current !== copiedPageUrl
        ) {
          return;
        }
        setOutcome({ summary: copiedSummary, pageUrl: copiedPageUrl, status: "copied" });
      },
      () => {
        if (
          attemptRef.current !== attempt ||
          currentSummaryRef.current !== copiedSummary ||
          currentPageUrlRef.current !== copiedPageUrl
        ) {
          return;
        }
        setOutcome({ summary: copiedSummary, pageUrl: copiedPageUrl, status: "error" });
      },
    );
  }, [pageUrl, selectionCopyContext, summary]);

  const sourceHintsResolving =
    originState.status === "pending" &&
    summary !== null &&
    originState.runtimeId === summary.identity.runtimeId;
  const currentOutcome =
    outcome?.summary === summary && outcome.pageUrl === pageUrl ? outcome.status : "idle";
  const selectionCopyStatus: SelectionCopyStatus =
    currentOutcome === "idle" && sourceHintsResolving ? "resolving" : currentOutcome;

  return {
    canCopySelectionContext: selectionCopyContext !== null,
    selectionCopyStatus,
    handleCopySelectionContext,
  };
}
