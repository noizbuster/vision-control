import type { ReactElement } from "react";

import type { ReparentControllerState } from "./ReparentController.js";

interface ReparentStatusProps {
  readonly state: ReparentControllerState;
}

export function ReparentStatus({ state }: ReparentStatusProps): ReactElement | null {
  if (!state.isActive && state.lastResult === null) {
    return null;
  }

  return (
    <section className="reparent-status" aria-label="Reparent status">
      <header className="reparent-status__header">
        <h3>Reparent</h3>
        <span className={`reparent-status__phase reparent-status__phase--${state.phase}`}>
          {state.phase}
        </span>
      </header>

      <div className="reparent-status__feasibility">
        <span
          className={`reparent-status__verdict reparent-status__verdict--${
            state.feasibility.canReparent ? "ok" : "blocked"
          }`}
        >
          {state.feasibility.canReparent ? "Can reparent" : "Blocked"}
        </span>
        <span
          className={`reparent-status__confidence reparent-status__confidence--${state.feasibility.confidence}`}
        >
          {state.feasibility.confidence} confidence
        </span>
      </div>

      {state.feasibility.risks.length > 0 && (
        <ul className="reparent-status__risks">
          {state.feasibility.risks.map((risk, index) => (
            <li key={`${risk.kind}-${index}`} className="reparent-status__risk">
              <span className="reparent-status__risk-kind">{risk.kind}</span>
              <span className="reparent-status__risk-reason">{risk.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {state.highlight !== null && (
        <div className="reparent-status__highlight">
          Target:{" "}
          <span className={`reparent-status__validity--${state.highlight.validity}`}>
            {state.highlight.validity}
          </span>
          {state.highlight.warning !== null && (
            <span className="reparent-status__warning">{state.highlight.warning}</span>
          )}
        </div>
      )}

      {state.lastResult !== null && (
        <div className="reparent-status__result">
          {state.lastResult.status === "committed" ? (
            <span className="reparent-status__committed">Committed</span>
          ) : (
            <span className="reparent-status__rejected">Rejected: {state.lastResult.reason}</span>
          )}
        </div>
      )}
    </section>
  );
}
