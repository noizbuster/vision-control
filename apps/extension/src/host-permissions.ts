/**
 * Panel-side host permission helpers.
 *
 * `chrome.permissions.request` MUST be called from a user gesture (the Allow
 * button click in the panel). These wrappers return a boolean success indicator
 * instead of throwing — the panel UI shows inline feedback either way.
 */

import { hostToOriginPatterns } from "./host-allowlist.js";

function getPermissions(): typeof chrome.permissions | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  return chrome.permissions;
}

export async function requestHostPermission(host: string): Promise<boolean> {
  const permissions = getPermissions();
  if (permissions === undefined) {
    return false;
  }
  try {
    const granted = await permissions.request({
      origins: [...hostToOriginPatterns(host)],
    });
    return granted;
  } catch {
    return false;
  }
}

export async function revokeHostPermission(host: string): Promise<boolean> {
  const permissions = getPermissions();
  if (permissions === undefined) {
    return false;
  }
  try {
    const removed = await permissions.remove({
      origins: [...hostToOriginPatterns(host)],
    });
    return removed;
  } catch {
    return false;
  }
}
