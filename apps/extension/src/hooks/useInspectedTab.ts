import { useEffect, useState } from "react";

interface InspectedTab {
  readonly tabId: number | undefined;
  readonly title: string | undefined;
  readonly url: string | undefined;
}

type InspectableChromeTab = chrome.tabs.Tab & { readonly id: number };

function getDevtoolsTabId(): number | undefined {
  if (typeof chrome === "undefined" || chrome.devtools === undefined) {
    return undefined;
  }
  return chrome.devtools.inspectedWindow.tabId;
}

function isPlaceholderUrl(url: string | undefined): boolean {
  if (url === undefined || url.length === 0) return true;
  return url === "about:blank" || url === "about:srcdoc";
}

function isUsefulPageUrl(url: string | undefined): url is string {
  return url !== undefined && !isPlaceholderUrl(url);
}

function isInspectableTabUrl(url: string | undefined): boolean {
  if (!isUsefulPageUrl(url)) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

function isInspectableTab(tab: chrome.tabs.Tab): tab is InspectableChromeTab {
  return typeof tab.id === "number" && isInspectableTabUrl(tab.url);
}

function pickFallbackTab(tabs: readonly chrome.tabs.Tab[]): InspectableChromeTab | null {
  const inspectable = tabs.filter(isInspectableTab);
  const active = inspectable.find((tab) => tab.active);
  if (active !== undefined) return active;
  const sorted = [...inspectable].sort(
    (left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0),
  );
  return sorted[0] ?? null;
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<readonly chrome.tabs.Tab[]> {
  if (typeof chrome === "undefined" || chrome.tabs?.query === undefined) {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError !== undefined) {
        resolve([]);
        return;
      }
      resolve(tabs);
    });
  });
}

function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === "undefined" || chrome.tabs?.get === undefined) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError !== undefined) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}

async function resolveFallbackTab(): Promise<InspectableChromeTab | null> {
  const currentWindowPick = pickFallbackTab(await queryTabs({ currentWindow: true }));
  if (currentWindowPick !== null) return currentWindowPick;
  return pickFallbackTab(await queryTabs({}));
}

/**
 * Live URL of the inspected page via DevTools. Prefer this over chrome.tabs
 * metadata: tabs.get can report about:blank while the inspected document is
 * already on a real origin (common when the panel mounts mid-navigation or
 * before host metadata catches up).
 */
function evalInspectedHref(): Promise<string | undefined> {
  if (typeof chrome === "undefined" || chrome.devtools?.inspectedWindow?.eval === undefined) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    try {
      chrome.devtools.inspectedWindow.eval<string>("location.href", (result, exceptionInfo) => {
        if (exceptionInfo?.isException) {
          resolve(undefined);
          return;
        }
        if (typeof result === "string" && result.length > 0) {
          resolve(result);
          return;
        }
        resolve(undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

export function useInspectedTab(): InspectedTab {
  const [tabId, setTabId] = useState<number | undefined>(getDevtoolsTabId);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const applyUrl = (nextUrl: string | undefined): void => {
      if (cancelled || !isUsefulPageUrl(nextUrl)) return;
      setUrl(nextUrl);
    };

    const applyTitle = (nextTitle: string | undefined): void => {
      if (cancelled || nextTitle === undefined) return;
      setTitle(nextTitle);
    };

    const applyTabMetadata = (tab: chrome.tabs.Tab): void => {
      applyTitle(tab.title);
      // Prefer non-placeholder URLs only. about:blank from tabs.get must not
      // overwrite a real URL resolved via DevTools eval / onNavigated.
      applyUrl(tab.url);
    };

    const refreshFromDevtools = async (): Promise<void> => {
      const href = await evalInspectedHref();
      applyUrl(href);
    };

    const inspectedTabId = getDevtoolsTabId();
    if (inspectedTabId !== undefined) {
      setTabId(inspectedTabId);

      void getTab(inspectedTabId).then((tab) => {
        if (tab !== null) applyTabMetadata(tab);
      });
      void refreshFromDevtools();

      const onNavigated =
        typeof chrome !== "undefined" && chrome.devtools?.network?.onNavigated !== undefined
          ? (navigatedUrl: string): void => {
              applyUrl(navigatedUrl);
              void getTab(inspectedTabId).then((tab) => {
                if (tab !== null) applyTitle(tab.title);
              });
            }
          : null;

      const onTabUpdated =
        typeof chrome !== "undefined" && chrome.tabs?.onUpdated !== undefined
          ? (
              updatedTabId: number,
              changeInfo: chrome.tabs.OnUpdatedInfo,
              tab: chrome.tabs.Tab,
            ): void => {
              if (updatedTabId !== inspectedTabId) return;
              if (changeInfo.title !== undefined) applyTitle(changeInfo.title);
              if (changeInfo.url !== undefined) {
                applyUrl(changeInfo.url);
              } else if (changeInfo.status === "complete") {
                applyTabMetadata(tab);
                void refreshFromDevtools();
              }
            }
          : null;

      onNavigated !== null && chrome.devtools.network.onNavigated.addListener(onNavigated);
      onTabUpdated !== null && chrome.tabs.onUpdated.addListener(onTabUpdated);

      return () => {
        cancelled = true;
        if (onNavigated !== null) {
          chrome.devtools.network.onNavigated.removeListener(onNavigated);
        }
        if (onTabUpdated !== null) {
          chrome.tabs.onUpdated.removeListener(onTabUpdated);
        }
      };
    }

    void resolveFallbackTab().then((tab) => {
      if (tab === null || cancelled) return;
      setTabId(tab.id);
      applyTabMetadata(tab);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tabId, title, url };
}
