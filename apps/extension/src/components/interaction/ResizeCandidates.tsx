import type {
  ResizeCandidate,
  ResizeCandidateKind,
  ResizeCandidateSet,
  ResizePropertyKind,
} from "@vision-control/layout-engine";
import { useCallback, useEffect, useState } from "react";

import type { BusMessage, MessageBus } from "../../messaging/index.js";
import {
  createResizeCandidateSelectMessage,
  isResizeCandidateSet,
} from "../../messaging/resize-messages.js";

interface ResizeCandidatesProps {
  readonly bus: MessageBus | undefined;
}

type CandidateState =
  | { readonly kind: "empty" }
  | {
      readonly kind: "candidates";
      readonly candidates: readonly ResizeCandidate[];
      readonly selectedKey: string | null;
    }
  | { readonly kind: "unsupported"; readonly message: string };

function candidateLabel(candidate: ResizeCandidate): string {
  switch (candidate.kind) {
    case "css-property":
      return `${candidate.property}: ${candidate.rationale}`;
    case "grid-span":
      return `grid-${candidate.axis} span ${candidate.fromSpan}\u2192${candidate.toSpan}: ${candidate.rationale}`;
    case "intrinsic":
      return `intrinsic: ${candidate.rationale}`;
    case "tailwind-class":
      return `tailwind class: ${candidate.rationale}`;
    case "design-token":
      return `design token: ${candidate.rationale}`;
  }
}

function candidateKey(candidate: ResizeCandidate): string {
  switch (candidate.kind) {
    case "css-property":
      return `css-property:${candidate.property}`;
    case "grid-span":
      return `grid-span:${candidate.axis}:${candidate.fromSpan}:${candidate.toSpan}`;
    case "intrinsic":
      return "intrinsic";
    case "tailwind-class":
      return "tailwind-class";
    case "design-token":
      return "design-token";
  }
}

function selectionFrom(candidate: ResizeCandidate): {
  readonly kind: ResizeCandidateKind;
  readonly property?: ResizePropertyKind;
} {
  if (candidate.kind === "css-property") {
    return { kind: "css-property", property: candidate.property };
  }
  return { kind: candidate.kind };
}

export function ResizeCandidates({ bus }: ResizeCandidatesProps): React.ReactElement | null {
  const [state, setState] = useState<CandidateState>({ kind: "empty" });

  useEffect(() => {
    if (bus === undefined) {
      return;
    }
    return bus.on("resize-candidates", (message: BusMessage) => {
      const payload = message.payload as unknown;
      if (!isResizeCandidateSet(payload)) {
        return;
      }
      const candidateSet = payload as ResizeCandidateSet;
      if (!candidateSet.supported) {
        setState({ kind: "unsupported", message: candidateSet.message });
        return;
      }
      const first = candidateSet.candidates[0];
      setState({
        kind: "candidates",
        candidates: candidateSet.candidates,
        selectedKey: first === undefined ? null : candidateKey(first),
      });
    });
  }, [bus]);

  const selectCandidate = useCallback(
    (candidate: ResizeCandidate): void => {
      setState((current) =>
        current.kind === "candidates"
          ? { ...current, selectedKey: candidateKey(candidate) }
          : current,
      );
      if (bus !== undefined) {
        const selection = selectionFrom(candidate);
        bus.send(
          "background",
          createResizeCandidateSelectMessage(selection.kind, selection.property),
        );
      }
    },
    [bus],
  );

  if (state.kind === "empty") {
    return null;
  }

  if (state.kind === "unsupported") {
    return (
      <section className="resize-candidates">
        <header className="resize-candidates__header">Resize</header>
        <p className="resize-candidates__unsupported" data-testid="resize-unsupported">
          {state.message}
        </p>
      </section>
    );
  }

  return (
    <section className="resize-candidates">
      <header className="resize-candidates__header">Resize candidate</header>
      <ul className="resize-candidates__list">
        {state.candidates.map((candidate) => {
          const key = candidateKey(candidate);
          const isSelected = state.selectedKey === key;
          return (
            <li key={key} className="resize-candidates__item">
              <button
                type="button"
                className={`resize-candidates__button${isSelected ? " resize-candidates__button--selected" : ""}`}
                onClick={() => selectCandidate(candidate)}
                data-testid={`resize-candidate-${key}`}
                aria-pressed={isSelected}
              >
                {candidateLabel(candidate)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
