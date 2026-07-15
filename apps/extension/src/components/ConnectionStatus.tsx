import type { ReactElement } from "react";

import type { ConnectionState } from "../messaging/index.js";

interface ConnectionStatusProps {
  readonly status: ConnectionState;
}

export function agentPairLabel(status: ConnectionState): string {
  switch (status) {
    case "connected":
      return "Agent paired";
    case "connecting":
      return "Pairing…";
    case "reconnecting":
      return "Reconnecting…";
    case "disconnected":
      return "Agent unpaired";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function ConnectionStatus({ status }: ConnectionStatusProps): ReactElement {
  return (
    <div
      className="connection-status"
      data-testid="connection-status"
      data-editing-ready="true"
      data-agent-pair-state={status}
    >
      <span className="connection-status__editing" data-testid="editing-ready">
        Editing ready
      </span>
      <span
        className={`connection connection--${status}`}
        data-testid="agent-pair-status"
        data-agent-pair-state={status}
      >
        {agentPairLabel(status)}
      </span>
    </div>
  );
}
