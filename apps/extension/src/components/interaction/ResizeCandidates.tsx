import type {
  ResizeCandidate,
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
      readonly selected: ResizePropertyKind | null;
    }
  | { readonly kind: "unsupported"; readonly message: string };

function candidateLabel(candidate: ResizeCandidate): string {
  return `${candidate.property}: ${candidate.rationale}`;
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
      setState({
        kind: "candidates",
        candidates: candidateSet.candidates,
        selected: candidateSet.candidates[0]?.property ?? null,
      });
    });
  }, [bus]);

  const selectCandidate = useCallback(
    (property: ResizePropertyKind): void => {
      setState((current) =>
        current.kind === "candidates" ? { ...current, selected: property } : current,
      );
      if (bus !== undefined) {
        bus.send("background", createResizeCandidateSelectMessage(property));
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
          const isSelected = state.selected === candidate.property;
          return (
            <li key={candidate.property} className="resize-candidates__item">
              <button
                type="button"
                className={`resize-candidates__button${isSelected ? " resize-candidates__button--selected" : ""}`}
                onClick={() => selectCandidate(candidate.property)}
                data-testid={`resize-candidate-${candidate.property}`}
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
