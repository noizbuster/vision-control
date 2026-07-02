import type { ReactElement } from "react";

type ConnectionStatusValue = "connected" | "connecting" | "disconnected";

interface ConnectionStatusProps {
  readonly status: ConnectionStatusValue;
}

export function ConnectionStatus({ status }: ConnectionStatusProps): ReactElement {
  return <span className={`connection connection--${status}`}>{status}</span>;
}
