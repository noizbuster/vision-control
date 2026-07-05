import {
  type AllowHostOutcome,
  runAllowHostGrant,
  validateHostForGrant,
} from "../../src/allow-host-page.js";

interface PageElements {
  readonly status: HTMLElement;
  readonly actions: HTMLElement;
}

function getElements(): PageElements | null {
  const status = document.getElementById("status");
  const actions = document.getElementById("actions");
  if (status === null || actions === null) {
    return null;
  }
  return { status, actions };
}

const COPY: Record<AllowHostOutcome, (host: string | null) => string> = {
  granted: () => "Granted — you can close this tab.",
  denied: () => "Permission denied — close this tab.",
  invalid: () => "Invalid host. Close this tab and enter a valid hostname (e.g. subshell).",
  missing: () => "No host specified. Close this tab and use the panel to grant a host.",
};

function renderOutcome(outcome: AllowHostOutcome, host: string | null): void {
  const elements = getElements();
  if (elements === null) {
    return;
  }
  elements.status.textContent = COPY[outcome](host);
  elements.actions.innerHTML = "";
}

function renderGrantPrompt(host: string): void {
  const elements = getElements();
  if (elements === null) {
    return;
  }
  elements.status.textContent = `Grant Vision Control access to "${host}"?`;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.testid = "grant-button";
  button.textContent = `Allow ${host}`;
  button.addEventListener("click", () => {
    void onGrantClick(host, button);
  });
  elements.actions.innerHTML = "";
  elements.actions.append(button);
}

async function onGrantClick(host: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = "Requesting…";
  const result = await runAllowHostGrant(host);
  renderOutcome(result.outcome, result.host);
  if (result.outcome === "granted") {
    setTimeout(closeCurrentTab, 2000);
  }
}

function closeCurrentTab(): void {
  if (typeof chrome === "undefined" || chrome.tabs?.getCurrent === undefined) {
    return;
  }
  chrome.tabs.getCurrent((tab) => {
    if (chrome.tabs?.remove !== undefined && tab?.id !== undefined) {
      void chrome.tabs.remove(tab.id);
    }
  });
}

async function main(): Promise<void> {
  const params = new URLSearchParams(globalThis.location.search);
  const hostInput = params.get("host");
  const validation = validateHostForGrant(hostInput);
  if (!validation.valid) {
    renderOutcome(validation.reason, null);
    return;
  }
  renderGrantPrompt(validation.host);
}

void main();
