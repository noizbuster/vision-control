import { CONTENT_SCRIPT_PATH, isInspectablePageUrl, isLoopbackUrl } from "./host-allowlist.js";

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

export function shouldInjectForUrl(
  url: string | undefined,
  _grantedHosts: readonly string[] = [],
): boolean {
  void url;
  void _grantedHosts;
  return false;
}

function getScripting(): typeof chrome.scripting | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  return chrome.scripting;
}

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

  if (isLoopbackUrl(url) || !isInspectablePageUrl(url)) {
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
