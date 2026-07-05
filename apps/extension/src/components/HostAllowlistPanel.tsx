import type { ReactElement } from "react";
import { useState } from "react";
import { useGrantedHosts } from "../hooks/useGrantedHosts.js";
import {
  isLoopbackHost,
  LOOPBACK_HOSTS,
  normalizeHostInput,
  STORAGE_KEY,
} from "../host-allowlist.js";
import { requestHostPermission, revokeHostPermission } from "../host-permissions.js";
import { createHostAccessChangedMessage } from "../messaging/panel-messages.js";

function notifyHostAccessChanged(): void {
  if (typeof chrome === "undefined" || chrome.runtime?.sendMessage === undefined) {
    return;
  }
  void chrome.runtime.sendMessage(createHostAccessChangedMessage()).catch(() => {
    // no-excuse-ok: catch - storage/permission listeners still handle this if the worker is restarting.
  });
}

export function HostAllowlistPanel(): ReactElement {
  const { hosts } = useGrantedHosts();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleAllow = async (): Promise<void> => {
    const normalized = normalizeHostInput(input);
    if (normalized === null) {
      setError("Enter a valid hostname (e.g. subshell or subshell:10601).");
      return;
    }
    if (isLoopbackHost(normalized) || hosts.includes(normalized)) {
      setError(`"${normalized}" is already in the allowlist.`);
      return;
    }

    setBusy(true);
    setError(null);
    const granted = await requestHostPermission(normalized);
    if (!granted) {
      setError("Permission denied. The host was not added.");
      setBusy(false);
      return;
    }

    const updated = [...hosts, normalized];
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
      notifyHostAccessChanged();
      setInput("");
    } catch {
      setError("Granted but failed to persist. Please retry.");
    }
    setBusy(false);
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
      notifyHostAccessChanged();
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
              void handleAllow();
            }
          }}
        />
        <button
          type="button"
          className="host-allowlist__allow"
          onClick={() => void handleAllow()}
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
