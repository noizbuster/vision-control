import { useEffect, useState } from "react";

interface InspectedTab {
  readonly tabId: number | undefined;
  readonly title: string | undefined;
  readonly url: string | undefined;
}

function getInitialTabId(): number | undefined {
  if (typeof chrome === "undefined" || chrome.devtools === undefined) {
    return undefined;
  }
  return chrome.devtools.inspectedWindow.tabId;
}

export function useInspectedTab(): InspectedTab {
  const [tabId, setTabId] = useState<number | undefined>(getInitialTabId);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const inspectedTabId = getInitialTabId();
    setTabId(inspectedTabId);

    if (inspectedTabId === undefined || typeof chrome === "undefined") {
      return;
    }

    chrome.tabs.get(inspectedTabId, (tab) => {
      if (chrome.runtime.lastError !== undefined) {
        return;
      }
      setTitle(tab.title);
      setUrl(tab.url);
    });
  }, []);

  return { tabId, title, url };
}
