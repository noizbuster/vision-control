/**
 * Parse the element's class attribute into inspected class entries.
 */

import type { DomAdapter } from "./dom-adapter.js";
import type { ClassEntry, ClassSource } from "./inspector-data.js";

/**
 * Split the element's `className` into individual entries tagged with a source
 * hint. The source hint is a placeholder until task 23 provides real source
 * resolution; Tailwind utility classes are detected heuristically.
 */
export function buildClassList(element: Element, domAdapter: DomAdapter): ClassEntry[] {
  const data = domAdapter.getElementData(element);
  const classes = data.className.split(/\s+/).filter((name) => name.length > 0);
  return classes.map((name) => ({ name, source: inferClassSource(name) }));
}

function inferClassSource(name: string): ClassSource {
  if (looksLikeTailwind(name)) {
    return "tailwind";
  }
  return "unknown";
}

function looksLikeTailwind(name: string): boolean {
  // Common Tailwind prefix families. This is intentionally conservative; the
  // real classification arrives with source resolution in task 23.
  const prefixes = [
    "m-",
    "mx-",
    "my-",
    "mt-",
    "mr-",
    "mb-",
    "ml-",
    "p-",
    "px-",
    "py-",
    "pt-",
    "pr-",
    "pb-",
    "pl-",
    "w-",
    "h-",
    "min-w-",
    "min-h-",
    "max-w-",
    "max-h-",
    "flex",
    "grid",
    "block",
    "inline",
    "relative",
    "absolute",
    "fixed",
    "sticky",
    "static",
    "text-",
    "font-",
    "bg-",
    "border-",
    "rounded",
    "shadow",
    "hover:",
    "focus:",
    "active:",
    "disabled:",
    "sm:",
    "md:",
    "lg:",
    "xl:",
    "2xl:",
    "space-",
    "gap-",
    "items-",
    "justify-",
    "content-",
    "self-",
    "place-",
    "overflow-",
    "z-",
    "opacity-",
    "cursor-",
    "select-",
    "pointer-events-",
    "transition",
    "duration-",
    "ease-",
    "delay-",
    "transform",
    "scale-",
    "rotate-",
    "translate-",
    "skew-",
    "origin-",
    "sr-only",
    "not-sr-only",
  ];
  return prefixes.some((prefix) => name === prefix.replace(/-$/, "") || name.startsWith(prefix));
}
