/**
 * Build an accessible semantic summary of the selected element.
 */

import type { DomAdapter } from "./dom-adapter.js";
import type { SemanticSummary } from "./inspector-data.js";

const TEXT_PREVIEW_MAX_LENGTH = 100;

/**
 * Build a {@link SemanticSummary} from ARIA and DOM data.
 *
 * Uses the explicit ARIA role/name when present, falling back to tag-based
 * inference. The text content preview is truncated and later redacted before
 * export so the panel can still show a short snippet while secrets are masked
 * for the daemon.
 */
export function buildSemanticSummary(element: Element, domAdapter: DomAdapter): SemanticSummary {
  const data = domAdapter.getElementData(element);
  const role = data.role ?? inferRoleFromTag(data.tagName);
  const name = data.name ?? inferNameFromElement(element);
  const description = element.getAttribute("aria-description") ?? undefined;

  return {
    role,
    name,
    description,
    tagName: data.tagName,
    textContentPreview: truncateText(element.textContent ?? ""),
  };
}

function inferRoleFromTag(tagName: string): string | undefined {
  const map: Record<string, string> = {
    button: "button",
    a: "link",
    input: "textbox",
    textarea: "textbox",
    select: "combobox",
    nav: "navigation",
    main: "main",
    aside: "complementary",
    header: "banner",
    footer: "contentinfo",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    ul: "list",
    ol: "list",
    li: "listitem",
    img: "img",
  };
  return map[tagName];
}

function inferNameFromElement(element: Element): string | undefined {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy !== null && labelledBy.length > 0) {
    const label = element.ownerDocument?.getElementById(labelledBy);
    if (label !== null && label !== undefined) {
      return label.textContent ?? undefined;
    }
  }
  return undefined;
}

function truncateText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= TEXT_PREVIEW_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, TEXT_PREVIEW_MAX_LENGTH)}…`;
}
