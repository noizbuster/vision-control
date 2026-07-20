import type { Operation } from "@vision-control/change-ir";
import type { AutoLayoutCommand, AutoLayoutContainerContext } from "@vision-control/layout-engine";
import { createFlexGridAxis, type FlexGridAxis } from "@vision-control/overlay-ui";

import {
  type AutoLayoutElementRef,
  buildAutoLayoutOperations,
  isFlexOrGridDisplay,
} from "../components/inspector/auto-layout-operations.js";
import type { GapGesture } from "./auto-layout-gap-gesture.js";
import { AUTO_LAYOUT_OVERLAY_CSS } from "./auto-layout-overlay-css.js";
import {
  appendAutoLayoutControls,
  type ApplyAutoLayoutCommand,
} from "./auto-layout-overlay-panel.js";
import { getOrAssignPreviewRuntimeId } from "./interaction-selection-capture.js";

export interface PropertyInspectorAutoLayoutOptions {
  readonly document: Document;
  readonly shadowRoot: ShadowRoot;
  readonly inspectorRoot: HTMLElement;
  readonly element: Element;
  readonly elementRef: AutoLayoutElementRef;
  readonly emit: (operation: Operation) => void;
  readonly registerElement: (runtimeId: string, element: Element) => void;
  readonly trackCleanup: (cleanup: () => void) => void;
}

const EMBEDDED_SECTION_CSS = /* css */ `
  .vc-inspector .vc-auto-layout__section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 4px;
    border-top: 1px solid oklch(28% 0.01 260);
  }
  .vc-inspector .vc-auto-layout__section-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: oklch(65% 0.03 260);
  }
  .vc-inspector .vc-auto-layout__role {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
    background: oklch(28% 0.02 260);
    color: oklch(80% 0.05 260);
    margin-left: 4px;
  }
`;

function ensureAutoLayoutCss(shadowRoot: ShadowRoot, doc: Document): void {
  if (shadowRoot.querySelector("style[data-vc-auto-layout-css]") !== null) return;
  const style = doc.createElement("style");
  style.setAttribute("data-vc-auto-layout-css", "");
  style.textContent = `${AUTO_LAYOUT_OVERLAY_CSS}${EMBEDDED_SECTION_CSS}`;
  shadowRoot.appendChild(style);
}

function ensurePageChromeHost(shadowRoot: ShadowRoot, doc: Document): HTMLElement {
  const existing = shadowRoot.querySelector<HTMLElement>("[data-vc-auto-layout-page-chrome]");
  if (existing !== null) return existing;
  const host = doc.createElement("div");
  host.setAttribute("data-vc-auto-layout-page-chrome", "");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483644;";
  shadowRoot.appendChild(host);
  return host;
}

export function appendAutoLayoutToPropertyInspector(
  options: PropertyInspectorAutoLayoutOptions,
): boolean {
  const {
    document: doc,
    shadowRoot,
    inspectorRoot,
    element,
    elementRef,
    emit,
    registerElement,
    trackCleanup,
  } = options;

  const display = doc.defaultView?.getComputedStyle(element).display ?? "";
  if (!isFlexOrGridDisplay(display)) return false;

  ensureAutoLayoutCss(shadowRoot, doc);
  const pageChrome = ensurePageChromeHost(shadowRoot, doc);
  pageChrome.replaceChildren();

  const axis: FlexGridAxis = createFlexGridAxis(pageChrome);
  trackCleanup(() => {
    axis.clear();
    pageChrome.replaceChildren();
  });

  let gapGesture: GapGesture | null = null;
  trackCleanup(() => {
    gapGesture?.dispose();
    gapGesture = null;
  });

  const section = doc.createElement("div");
  section.className = "vc-auto-layout__section";
  section.setAttribute("data-testid", "vc-inspector-auto-layout");

  const heading = doc.createElement("div");
  heading.className = "vc-inspector__label vc-auto-layout__section-label";
  const headingText = doc.createElement("span");
  headingText.textContent = "auto layout";
  heading.appendChild(headingText);
  section.appendChild(heading);

  const applyCommand: ApplyAutoLayoutCommand = (
    command: AutoLayoutCommand,
    container: AutoLayoutContainerContext,
    previousValues: Readonly<Record<string, string>>,
    childRef?: AutoLayoutElementRef,
  ): void => {
    const result = buildAutoLayoutOperations({
      command,
      container,
      containerRef: elementRef,
      origin: "canvas-drag",
      previousValues,
      ...(childRef !== undefined ? { childRef } : {}),
    });
    if (!result.ok) return;
    for (const operation of result.operations) {
      emit(operation);
    }
  };

  const childRefAt = (host: Element, index: number): AutoLayoutElementRef | undefined => {
    const child = host.children.item(index);
    if (child === null) return undefined;
    const runtimeId = getOrAssignPreviewRuntimeId(child);
    registerElement(runtimeId, child);
    return { runtimeId };
  };

  const mounted = appendAutoLayoutControls({
    document: doc,
    root: section,
    element,
    axisHost: pageChrome,
    axis,
    applyCommand,
    childRefAt,
    trackCleanup,
    setGapGesture: (gesture) => {
      gapGesture?.dispose();
      gapGesture = gesture;
    },
    embedded: true,
    onRole: (role) => {
      const badge = doc.createElement("span");
      badge.className = "vc-auto-layout__role";
      badge.textContent = role;
      heading.appendChild(badge);
    },
  });

  if (!mounted) return false;
  inspectorRoot.appendChild(section);
  return true;
}
