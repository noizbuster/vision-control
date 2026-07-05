/**
 * On-demand content-script injection for granted non-loopback hosts.
 *
 * The static manifest `content_scripts.matches` covers loopback only
 * (`localhost` / `127.0.0.1` / `[::1]`). For runtime-granted hosts the
 * background calls `chrome.scripting.executeScript` when a tab finishes loading.
 * This is the standard Chrome pattern for runtime-configurable host injection
 * (used by uBlock, Privacy Badger, etc.) and replaces the unreliable
 * `registerContentScripts` approach, which silently failed to inject on real
 * Chrome for non-loopback hosts.
 *
 * Loopback hosts are explicitly excluded here — the static content script
 * already covers them, and double-injection would corrupt the overlay.
 */

import { CONTENT_SCRIPT_PATH, isLoopbackUrl, urlMatchesGrantedHosts } from "./host-allowlist.js";

/**
 * Tracks which tab IDs have already been injected in this service-worker
 * lifetime. Prevents double-injection (which would double-mount the overlay).
 *
 * The background clears an entry on navigation (`tabs.onUpdated` loading) and
 * on tab close (`tabs.onRemoved`) so the next page load re-injects.
 */
export class TabInjectionRegistry {
  private readonly injectedTabs = new Set<number>();

  has(tabId: number): boolean {
    return this.injectedTabs.has(tabId);
  }

  markInjected(tabId: number): void {
    this.injectedTabs.add(tabId);
  }

  clear(tabId: number): void {
    this.injectedTabs.delete(tabId);
  }

  clearAll(): void {
    this.injectedTabs.clear();
  }
}

/**
 * Returns true if the URL is a granted non-loopback host that needs on-demand
 * `executeScript` injection. Loopback URLs return false (static CS covers them).
 */
export function shouldInjectForUrl(
  url: string | undefined,
  grantedHosts: readonly string[],
): boolean {
  if (url === undefined) {
    return false;
  }
  if (isLoopbackUrl(url)) {
    return false;
  }
  return urlMatchesGrantedHosts(url, grantedHosts);
}

function getScripting(): typeof chrome.scripting | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  return chrome.scripting;
}

/**
 * Inject the content script into a tab when the URL is a granted non-loopback
 * host and the tab has not already been injected.
 *
 * If the tab was previously injected but the URL is no longer injectable
 * (navigated away, host revoked), the registry entry is cleared so a future
 * navigation back to a granted host re-injects.
 *
 * On `executeScript` rejection the error is logged to `console.error`
 * (visible in chrome://extensions -> service worker -> Inspect) and the
 * registry entry is cleared to allow a future retry.
 *
 * Returns true if injection was actually triggered, false if it was skipped.
 */
export function injectContentScriptIfNeeded(
  tabId: number,
  url: string | undefined,
  grantedHosts: readonly string[],
  registry: TabInjectionRegistry,
): boolean {
  if (!shouldInjectForUrl(url, grantedHosts)) {
    if (registry.has(tabId)) {
      registry.clear(tabId);
    }
    return false;
  }

  if (registry.has(tabId)) {
    return false;
  }

  const scripting = getScripting();
  if (scripting === undefined) {
    return false;
  }

  registry.markInjected(tabId);
  const targetUrl = url ?? "";
  scripting
    .executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_PATH],
    })
    .catch((err: unknown) => {
      console.error("[vc] content injection failed for", targetUrl, err);
      registry.clear(tabId);
    });
  return true;
}
