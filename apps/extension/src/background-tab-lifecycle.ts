import { injectContentScriptIfNeeded, TabInjectionRegistry } from "./content-injection.js";
import { isAllowedUrl } from "./host-allowlist.js";
import type { FrameInfo } from "./messaging/index.js";

export interface TabLifecycleStore {
  readonly resetForReload: (tabId: number) => void;
  readonly ensure: (tabId: number) => unknown;
  readonly updateFrameTree: (tabId: number, frameTree: readonly FrameInfo[]) => void;
  readonly remove: (tabId: number) => void;
}

interface TabUpdateInfo {
  readonly status?: "loading" | "complete" | "unloaded" | undefined;
}

interface TabForInjection {
  readonly id?: number | undefined;
  readonly url?: string | undefined;
}

export interface BackgroundTabLifecycleOptions {
  readonly store: TabLifecycleStore;
  readonly getGrantedHosts: () => readonly string[];
  readonly discoverFrames: (tabId: number) => Promise<readonly FrameInfo[]>;
  readonly queryTabs?: () => Promise<readonly TabForInjection[]>;
  readonly injectionRegistry?: TabInjectionRegistry;
}

export interface BackgroundTabLifecycle {
  readonly handleUpdated: (tabId: number, changeInfo: TabUpdateInfo, tab: TabForInjection) => void;
  readonly handleRemoved: (tabId: number) => void;
  readonly injectOpenTabs: () => Promise<void>;
}

function createChromeTabQuery(): () => Promise<readonly TabForInjection[]> {
  return async () => {
    if (typeof chrome === "undefined" || chrome.tabs?.query === undefined) {
      return [];
    }
    return chrome.tabs.query({});
  };
}

export function createBackgroundTabLifecycle(
  options: BackgroundTabLifecycleOptions,
): BackgroundTabLifecycle {
  const registry = options.injectionRegistry ?? new TabInjectionRegistry();
  const queryTabs = options.queryTabs ?? createChromeTabQuery();

  const removeUnauthorizedTab = (tabId: number): void => {
    registry.clear(tabId);
    options.store.remove(tabId);
  };

  const injectTab = (
    tabId: number,
    url: string | undefined,
    grantedHosts: readonly string[],
  ): void => {
    injectContentScriptIfNeeded(tabId, url, grantedHosts, registry);
  };

  const handleUpdated = (tabId: number, changeInfo: TabUpdateInfo, tab: TabForInjection): void => {
    if (changeInfo.status === "loading") {
      registry.clear(tabId);
      options.store.resetForReload(tabId);
      return;
    }

    if (changeInfo.status === "complete") {
      const grantedHosts = options.getGrantedHosts();
      if (!isAllowedUrl(tab.url, grantedHosts)) {
        removeUnauthorizedTab(tabId);
        return;
      }
      options.store.ensure(tabId);
      injectTab(tabId, tab.url, grantedHosts);
      void options.discoverFrames(tabId).then((frames) => {
        if (!isAllowedUrl(tab.url, options.getGrantedHosts())) {
          removeUnauthorizedTab(tabId);
          return;
        }
        options.store.updateFrameTree(tabId, [...frames]);
      });
    }
  };

  const handleRemoved = (tabId: number): void => {
    registry.clear(tabId);
    options.store.remove(tabId);
  };

  const injectOpenTabs = async (): Promise<void> => {
    const tabs = await queryTabs();
    const grantedHosts = options.getGrantedHosts();
    for (const tab of tabs) {
      const tabId = tab.id;
      if (tabId === undefined) {
        continue;
      }
      if (!isAllowedUrl(tab.url, grantedHosts)) {
        removeUnauthorizedTab(tabId);
        continue;
      }
      injectTab(tabId, tab.url, grantedHosts);
    }
  };

  return { handleUpdated, handleRemoved, injectOpenTabs };
}
