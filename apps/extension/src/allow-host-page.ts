/**
 * Allow-host extension page orchestration.
 *
 * `chrome.permissions.request` MUST run from a real extension page (popup /
 * options / a tab-hosted extension page) with a user gesture — it silently
 * fails from a DevTools panel context. This module owns the pure, testable
 * orchestration the `entrypoints/allow-host.ts` page drives: validate the host
 * param, request the origins, persist the grant. The entrypoint owns only DOM
 * rendering and tab lifecycle.
 */

import { normalizeHostInput, STORAGE_KEY } from "./host-allowlist.js";
import { requestHostPermission } from "./host-permissions.js";

/** Filename of the allow-host page, relative to the extension root. */
export const ALLOW_HOST_PAGE = "allow-host.html";

export type AllowHostOutcome = "granted" | "denied" | "invalid" | "missing";

export interface AllowHostResult {
  readonly outcome: AllowHostOutcome;
  readonly host: string | null;
}

export type AllowHostValidation =
  | { readonly valid: true; readonly host: string }
  | { readonly valid: false; readonly reason: "missing" | "invalid" };

export function validateHostForGrant(hostInput: string | null): AllowHostValidation {
  if (hostInput === null || hostInput.trim().length === 0) {
    return { valid: false, reason: "missing" };
  }
  const normalized = normalizeHostInput(hostInput);
  if (normalized === null) {
    return { valid: false, reason: "invalid" };
  }
  return { valid: true, host: normalized };
}

/**
 * Extension-relative URL for the allow-host page carrying the granted host.
 * The background calls `chrome.runtime.getURL(buildAllowHostPageUrl(host))`
 * before `chrome.tabs.create`, so the host is encoded for URL transport.
 */
export function buildAllowHostPageUrl(host: string): string {
  return `${ALLOW_HOST_PAGE}?host=${encodeURIComponent(host)}`;
}

/**
 * Reads the current granted-host list, appends `host` if absent, and writes it
 * back. The background's `storage.onChanged` listener picks up the write and
 * re-syncs the dynamic content-script registration.
 */
export async function persistGrantedHost(host: string): Promise<void> {
  if (typeof chrome === "undefined" || chrome.storage?.local === undefined) {
    return;
  }
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  const existing: string[] = Array.isArray(raw)
    ? raw.filter((h): h is string => typeof h === "string")
    : [];
  if (existing.includes(host)) {
    return;
  }
  existing.push(host);
  await chrome.storage.local.set({ [STORAGE_KEY]: existing });
}

/**
 * Requests the host origins and, on grant, persists the host. Returns the
 * outcome so the entrypoint can render the matching UI. `requestHostPermission`
 * is the correct API here — this module is meant to run from the allow-host
 * extension page, NOT the DevTools panel.
 */
export async function performHostGrant(host: string): Promise<AllowHostOutcome> {
  const granted = await requestHostPermission(host);
  if (!granted) {
    return "denied";
  }
  await persistGrantedHost(host);
  return "granted";
}

/**
 * Full page-flow entrypoint: validate, then (if valid) request + persist.
 * Used by the entrypoint script on its "Grant access" click.
 */
export async function runAllowHostGrant(hostInput: string | null): Promise<AllowHostResult> {
  const validation = validateHostForGrant(hostInput);
  if (!validation.valid) {
    return { outcome: validation.reason, host: null };
  }
  const outcome = await performHostGrant(validation.host);
  return { outcome, host: validation.host };
}
