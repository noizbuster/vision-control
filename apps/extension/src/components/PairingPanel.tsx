import { PAIRING_PROTOCOL, parsePairingUrl } from "@vision-control/daemon-client";
import type { ReactElement } from "react";
import { useState } from "react";

import type { ConnectionState } from "../messaging/index.js";
import { ConnectionStatus } from "./ConnectionStatus.js";

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
    <section
      className={`pairing-panel pairing-panel--${status === "connected" ? "connected" : "form"}`}
      data-testid="pairing-panel"
      data-pairing-optional="true"
      data-editing-ready="true"
      data-agent-pair-state={status}
      aria-label="Agent MCP pairing optional"
    >
      <div className="pairing-panel__header">
        <h2 className="pairing-panel__title" data-testid="pairing-panel-title">
          Agent / MCP
        </h2>
        <span className="pairing-panel__optional" data-testid="pairing-optional-badge">
          optional
        </span>
      </div>
      <p className="pairing-panel__hint" data-testid="pairing-panel-hint">
        Editing works without pairing. Connect only when you want an agent projection.
      </p>
      <ConnectionStatus status={status} />
      {status === "connected" ? (
        <button type="button" className="pairing-panel__disconnect" onClick={onDisconnect}>
          Unpair agent
        </button>
      ) : (
        <>
          <input
            className="pairing-panel__input"
            type="text"
            value={value}
            placeholder="vision-control://pair?token=…&port=…&host=…"
            aria-label="Agent MCP pairing URL"
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
            Pair agent
          </button>
          {error !== null && (
            <p className="pairing-panel__error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
