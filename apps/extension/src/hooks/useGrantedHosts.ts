import { useEffect, useState } from "react";

import { STORAGE_KEY } from "../host-allowlist.js";

interface GrantedHostsState {
  readonly hosts: readonly string[];
}

function readFromStorage(): Promise<readonly string[]> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || chrome.storage?.local?.get === undefined) {
      resolve([]);
      return;
    }
    void chrome.storage.local
      .get(STORAGE_KEY)
      .then((result: Record<string, unknown>) => {
        const raw = result[STORAGE_KEY];
        if (Array.isArray(raw)) {
          resolve(raw.filter((h): h is string => typeof h === "string"));
        } else {
          resolve([]);
        }
      })
      .catch(() => resolve([]));
  });
}

export function useGrantedHosts(): GrantedHostsState {
  const [hosts, setHosts] = useState<readonly string[]>([]);

  useEffect(() => {
    let active = true;

    void readFromStorage().then((loaded) => {
      if (active) {
        setHosts(loaded);
      }
    });

    if (typeof chrome === "undefined" || chrome.storage?.onChanged?.addListener === undefined) {
      return () => {
        active = false;
      };
    }

    const listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>) => {
      if (!(STORAGE_KEY in changes)) {
        return;
      }
      const change = changes[STORAGE_KEY];
      if (change === undefined) {
        return;
      }
      const value = change.newValue;
      if (Array.isArray(value)) {
        setHosts(value.filter((h): h is string => typeof h === "string"));
      } else {
        setHosts([]);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  return { hosts };
}
