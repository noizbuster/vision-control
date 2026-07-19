import {
  createTestDomAdapter,
  FakeMutationObserver,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import { createPreviewManager, type PreviewDomAdapter, type PreviewManager } from "./index.js";

export function resetDispatchTestDom(): void {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((element) => {
    element.remove();
  });
  resetOpCounter();
  FakeMutationObserver.instances.length = 0;
}

export function setupDispatchTest(): {
  readonly manager: PreviewManager;
  readonly dom: PreviewDomAdapter;
} {
  const dom = createTestDomAdapter(FakeMutationObserver);
  return { manager: createPreviewManager({ dom }), dom };
}

export function registerDiv(dom: PreviewDomAdapter, runtimeId: string, text?: string): HTMLElement {
  const element = document.createElement("div");
  element.textContent = text ?? runtimeId;
  dom.registerElement(runtimeId, element);
  return element;
}

export function registerParentWithChildren(
  dom: PreviewDomAdapter,
  parentId: string,
  labels: readonly string[],
): HTMLElement {
  const parent = document.createElement("div");
  dom.registerElement(parentId, parent);
  document.body.appendChild(parent);
  for (const [index, label] of labels.entries()) {
    const runtimeId = `rt-c${index + 1}0001`;
    const child = document.createElement("div");
    child.textContent = label;
    child.id = runtimeId;
    dom.registerElement(runtimeId, child);
    parent.appendChild(child);
  }
  return parent;
}
