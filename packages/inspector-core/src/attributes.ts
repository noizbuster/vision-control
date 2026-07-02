/**
 * Extract the safe, exportable subset of element attributes.
 */

import { looksLikeSecret } from "@vision-control/security";

import type { DomAdapter } from "./dom-adapter.js";
import type { AttributeEntry } from "./inspector-data.js";

const EXCLUDED_ATTRIBUTES = new Set([
  "style",
  "onclick",
  "ondblclick",
  "onmousedown",
  "onmouseup",
  "onmouseover",
  "onmouseout",
  "onmousemove",
  "onmouseenter",
  "onmouseleave",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onreset",
  "onselect",
  "onload",
  "onunload",
  "onerror",
  "onresize",
  "onscroll",
]);

const IDENTITY_ATTR = "data-vc-source";

/**
 * Build an array of safe attribute entries for the selected element.
 *
 * Included: id, class, role, aria-*, data-* (except the identity marker),
 * href, src, type, name, and value for non-secret inputs.
 *
 * Excluded: inline style (covered by computed style), event handlers, the
 * identity marker `data-vc-source`, and any value that looks secret.
 */
export function buildAttributes(element: Element, domAdapter: DomAdapter): AttributeEntry[] {
  const data = domAdapter.getElementData(element);
  const entries: AttributeEntry[] = [];
  const isSecretInput = isPasswordLike(element);

  for (const [name, value] of Object.entries(data.attributes)) {
    if (isExcluded(name)) {
      continue;
    }
    if (name === "value" && isSecretInput) {
      continue;
    }
    if (looksLikeSecret(value)) {
      continue;
    }
    entries.push({ name, value });
  }

  return entries;
}

function isExcluded(name: string): boolean {
  if (EXCLUDED_ATTRIBUTES.has(name)) {
    return true;
  }
  if (name === IDENTITY_ATTR) {
    return true;
  }
  return false;
}

function isPasswordLike(element: Element): boolean {
  if (element.tagName.toLowerCase() !== "input") {
    return false;
  }
  const type = element.getAttribute("type")?.toLowerCase();
  return type === "password" || type === "hidden";
}
