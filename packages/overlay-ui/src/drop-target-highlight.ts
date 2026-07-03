import type { Rect } from "@vision-control/geometry";

export type DropTargetValidity = "valid" | "invalid";

export interface DropTargetHighlightState {
  readonly rect: Rect;
  readonly validity: DropTargetValidity;
  readonly warning?: string;
}

export interface DropTargetHighlighter {
  readonly highlight: (state: DropTargetHighlightState) => void;
  readonly clear: () => void;
}

const WARNING_ICON_SVG = /* svg */ `
  <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="vc-drop-warning__icon">
    <path d="M8 1L15 14H1L8 1Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M8 6V9.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="8" cy="12" r="0.75" fill="currentColor"/>
  </svg>
`;

const applyRect = (element: HTMLElement, rect: Rect): void => {
  element.style.left = `${rect.x}px`;
  element.style.top = `${rect.y}px`;
  element.style.width = `${rect.width}px`;
  element.style.height = `${rect.height}px`;
};

const getOrCreateRootContainer = (shadowRoot: ShadowRoot): HTMLElement => {
  const existing = shadowRoot.querySelector(".vc-overlay-root");
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const container = shadowRoot.ownerDocument.createElement("div");
  container.className = "vc-overlay-root";
  shadowRoot.appendChild(container);
  return container;
};

/**
 * Create a drop-target highlighter inside a shadow root.
 *
 * The highlighter draws a green outline for valid targets and a red outline
 * plus an optional warning label for invalid targets. All markup lives inside
 * the shadow tree so overlay styles never leak to the inspected page.
 */
export function createDropTargetHighlighter(shadowRoot: ShadowRoot): DropTargetHighlighter {
  const document = shadowRoot.ownerDocument;
  const root = getOrCreateRootContainer(shadowRoot);

  const highlightElement = document.createElement("div");
  highlightElement.className = "vc-drop-target-highlight";
  highlightElement.style.display = "none";

  const warningElement = document.createElement("div");
  warningElement.className = "vc-drop-warning";
  warningElement.style.display = "none";

  root.appendChild(highlightElement);
  root.appendChild(warningElement);

  const highlight = (state: DropTargetHighlightState): void => {
    applyRect(highlightElement, state.rect);
    highlightElement.className =
      state.validity === "invalid"
        ? "vc-drop-target-highlight vc-drop-target-highlight--invalid"
        : "vc-drop-target-highlight";
    highlightElement.style.display = "block";

    if (state.validity === "invalid" && state.warning !== undefined) {
      warningElement.innerHTML = `${WARNING_ICON_SVG}<span>${escapeHtml(state.warning)}</span>`;
      warningElement.style.display = "inline-flex";
      warningElement.style.left = `${state.rect.x}px`;
      warningElement.style.top = `${Math.max(0, state.rect.y - 22)}px`;
    } else {
      warningElement.style.display = "none";
      warningElement.replaceChildren();
    }
  };

  const clear = (): void => {
    highlightElement.style.display = "none";
    warningElement.style.display = "none";
    warningElement.replaceChildren();
  };

  return { highlight, clear };
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const highlighterCache = new WeakMap<ShadowRoot, DropTargetHighlighter>();

const forShadowRoot = (shadowRoot: ShadowRoot): DropTargetHighlighter => {
  const existing = highlighterCache.get(shadowRoot);
  if (existing !== undefined) {
    return existing;
  }
  const highlighter = createDropTargetHighlighter(shadowRoot);
  highlighterCache.set(shadowRoot, highlighter);
  return highlighter;
};

/**
 * Highlight a candidate drop target. Green outline for valid, red outline plus
 * warning icon for invalid.
 */
export const highlightDropTarget = (
  shadowRoot: ShadowRoot,
  rect: Rect,
  validity: DropTargetValidity,
  warning?: string,
): void => {
  forShadowRoot(shadowRoot).highlight({
    rect,
    validity,
    ...(warning !== undefined ? { warning } : {}),
  });
};

/** Remove the drop target highlight and any warning label. */
export const clearHighlight = (shadowRoot: ShadowRoot): void => {
  forShadowRoot(shadowRoot).clear();
};
