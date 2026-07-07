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

function isInspectableTabUrl(url: string | undefined): boolean {
  if (url === undefined) return false;
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

export function useInspectedTab(): InspectedTab {
  const [tabId, setTabId] = useState<number | undefined>(getDevtoolsTabId);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const applyTab = (tab: chrome.tabs.Tab): void => {
      if (cancelled) return;
      setTitle(tab.title);
      setUrl(tab.url);
    };

    const inspectedTabId = getDevtoolsTabId();
    if (inspectedTabId !== undefined) {
      setTabId(inspectedTabId);
      void getTab(inspectedTabId).then((tab) => {
        if (tab !== null) applyTab(tab);
      });
      return () => {
        cancelled = true;
      };
    }

    void resolveFallbackTab().then((tab) => {
      if (tab === null || cancelled) return;
      setTabId(tab.id);
      applyTab(tab);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tabId, title, url };
}
