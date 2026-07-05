import type { ReactElement } from "react";
import { useState } from "react";
import { useGrantedHosts } from "../hooks/useGrantedHosts.js";
import {
  isLoopbackHost,
  LOOPBACK_HOSTS,
  normalizeHostInput,
  STORAGE_KEY,
} from "../host-allowlist.js";
import { revokeHostPermission } from "../host-permissions.js";
import { createOpenAllowHostMessage, type MessageBus } from "../messaging/index.js";

interface HostAllowlistPanelProps {
  /**
   * Panel message bus used to ask the background to open the allow-host
   * extension page. `chrome.permissions.request` cannot run from the DevTools
   * panel context (it silently fails), so the Allow button delegates to the
   * background via this bus. Undefined until the bus initialises.
   */
  readonly bus?: MessageBus | undefined;
}

export function HostAllowlistPanel({ bus }: HostAllowlistPanelProps = {}): ReactElement {
  const { hosts } = useGrantedHosts();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAllow = (): void => {
    const normalized = normalizeHostInput(input);
    if (normalized === null) {
      setError("Enter a valid hostname (e.g. subshell or subshell:10601).");
      return;
    }
    if (isLoopbackHost(normalized) || hosts.includes(normalized)) {
      setError(`"${normalized}" is already in the allowlist.`);
      return;
    }
    if (bus === undefined) {
      setError("Panel is not ready. Reopen the panel and try again.");
      return;
    }
    bus.send("background", createOpenAllowHostMessage(normalized));
    setError(null);
    setStatus("Opening permission prompt…");
    setBusy(false);
    setInput("");
  };

  const handleRemove = async (host: string): Promise<void> => {
    setBusy(true);
    setError(null);
    const removed = await revokeHostPermission(host);
    if (!removed) {
      setError(`Could not revoke permission for "${host}".`);
      setBusy(false);
      return;
    }
    const updated = hosts.filter((h) => h !== host);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    } catch {
      setError(`Revoked but failed to persist. Please retry.`);
    }
    setBusy(false);
  };

  return (
    <section className="host-allowlist" data-testid="host-allowlist-panel">
      <h2 className="host-allowlist__title">Site Access</h2>
      <p className="host-allowlist__hint">
        Loopback sites are always allowed. Add a custom hostname to inspect non-loopback dev
        servers.
      </p>
      <div className="host-allowlist__form">
        <input
          className="host-allowlist__input"
          type="text"
          value={input}
          placeholder="host (e.g. subshell or subshell:10601)"
          onChange={(event) => {
            setInput(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleAllow();
            }
          }}
        />
        <button
          type="button"
          className="host-allowlist__allow"
          onClick={handleAllow}
          disabled={busy}
        >
          Allow
        </button>
      </div>
      {error !== null && (
        <p className="host-allowlist__error" role="alert">
          {error}
        </p>
      )}
      {status !== null && (
        <p className="host-allowlist__status" data-testid="host-allowlist-status">
          {status}
        </p>
      )}
      <ul className="host-allowlist__list" data-testid="host-list">
        {LOOPBACK_HOSTS.map((host) => (
          <li key={host} className="host-allowlist__item host-allowlist__item--default">
            <span className="host-allowlist__host">{host}</span>
            <span className="host-allowlist__badge">always-on</span>
          </li>
        ))}
        {hosts.map((host) => (
          <li key={host} className="host-allowlist__item host-allowlist__item--granted">
            <span className="host-allowlist__host">{host}</span>
            <button
              type="button"
              className="host-allowlist__remove"
              onClick={() => void handleRemove(host)}
              disabled={busy}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
