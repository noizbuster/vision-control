import { PAIRING_PROTOCOL, parsePairingUrl } from "@vision-control/daemon-client";
import type { ReactElement } from "react";
import { useState } from "react";

import type { ConnectionState } from "../messaging/index.js";

interface PairingPanelProps {
  readonly status: ConnectionState;
  readonly onConnect: (pairingUrl: string) => void;
  readonly onDisconnect: () => void;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4321;

function looksLikeBareToken(input: string): boolean {
  return input.length > 0 && !input.includes("://") && !input.includes("/");
}

function synthesizePairingUrl(token: string): string {
  const params = new URLSearchParams({
    token,
    port: String(DEFAULT_PORT),
    host: DEFAULT_HOST,
  });
  return `${PAIRING_PROTOCOL}//pair?${params.toString()}`;
}

export function PairingPanel({ status, onConnect, onDisconnect }: PairingPanelProps): ReactElement {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status === "connected") {
    return (
      <div className="pairing-panel pairing-panel--connected" data-testid="pairing-panel">
        <span className={`connection connection--${status}`}>{status}</span>
        <button type="button" className="pairing-panel__disconnect" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    );
  }

  const submit = (): void => {
    const trimmed = value.trim();
    const candidate = looksLikeBareToken(trimmed) ? synthesizePairingUrl(trimmed) : trimmed;
    const parsed = parsePairingUrl(candidate);
    if (!parsed.success) {
      setError(parsed.reason);
      return;
    }
    setError(null);
    onConnect(candidate);
  };

  return (
    <div className="pairing-panel pairing-panel--form" data-testid="pairing-panel">
      <input
        className="pairing-panel__input"
        type="text"
        value={value}
        placeholder="vision-control://pair?token=…&port=…&host=…"
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            submit();
          }
        }}
      />
      <button type="button" className="pairing-panel__connect" onClick={submit}>
        Connect
      </button>
      {error !== null && (
        <p className="pairing-panel__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
