import type { ReactElement } from "react";

import type { ConnectionState } from "../messaging/index.js";

interface ConnectionStatusProps {
  readonly status: ConnectionState;
}

export function ConnectionStatus({ status }: ConnectionStatusProps): ReactElement {
  return <span className={`connection connection--${status}`}>{status}</span>;
}
