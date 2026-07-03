/**
 * Deterministic overlay screenshot capture (PRD §31.6).
 *
 * The lab runs in vitest + jsdom, which performs no pixel rendering, and ADR-011
 * pins the V1 screenshot diff to a dependency-free BYTE ratio (no image codec).
 * The honest "screenshot" of an overlay render is therefore a DETERMINISTIC
 * serialization of the rendered shadow root: the active theme tokens followed by
 * one canonical line per rendered overlay element (tag, class, inline geometry,
 * data attributes). UTF-8-encoding that text yields the byte stream the
 * verification-engine `byteSimilarity` / `assertScreenshotSimilarity` diff runs
 * against — exactly the same primitive the byte-diff math fixtures exercise.
 *
 * Properties:
 *  - deterministic: same overlay DOM + theme ⇒ identical bytes every run;
 *  - theme-aware: theme tokens appear in section 1, so a theme switch is a diff;
 *  - regression-sensitive: any geometry/class/attribute change alters bytes.
 */

import type { ScreenshotCropData } from "@vision-control/verification-engine";

/** The theme-token prefix the serializer collects from the root container. */
const TOKEN_PREFIX = "--vc-";

/**
 * Serialize an overlay render into a canonical text block.
 *
 * @param shadowRoot  the overlay shadow root (from `attachOverlayRoot`)
 * @param rootContainer  the `.vc-overlay-root` element carrying theme tokens
 * @param label  diagnostic label folded into the header (NOT into the diff body
 *   when comparing renders of the same scenario across runs, but included so a
 *   full-suite dump is self-describing)
 */
export function serializeOverlay(
  shadowRoot: ShadowRoot,
  rootContainer: HTMLElement,
  label: string,
): string {
  const lines: string[] = [];
  lines.push(`# vc-overlay-screenshot label=${label}`);

  // Section 1 — active theme tokens (sorted for determinism).
  const tokens = collectTokens(rootContainer);
  for (const [name, value] of tokens) {
    lines.push(`t\t${name}=${value}`);
  }

  // Section 2 — rendered overlay elements in document order.
  walk(shadowRoot, lines);

  return `${lines.join("\n")}\n`;
}

/** Capture a serialized render as a diffable crop (UTF-8 bytes + FNV-1a hash). */
export function captureScreenshot(
  shadowRoot: ShadowRoot,
  rootContainer: HTMLElement,
  label: string,
): ScreenshotCropData {
  return cropFromText(serializeOverlay(shadowRoot, rootContainer, label));
}

/**
 * Build a diffable crop from a serialized text block. Baselines are committed
 * as readable text (see `overlay-baselines.ts`); this reconstructs their byte
 * stream + content hash through the SAME path a live capture uses, so a baseline
 * crop and a live crop are directly comparable.
 */
export function cropFromText(text: string): ScreenshotCropData {
  const bytes = new TextEncoder().encode(text);
  return { bytes, contentHash: fnv1aHex(text) };
}

function collectTokens(root: HTMLElement): ReadonlyArray<readonly [string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < root.style.length; i += 1) {
    const name = root.style.item(i);
    if (name === undefined || !name.startsWith(TOKEN_PREFIX)) continue;
    const value = root.style.getPropertyValue(name);
    out.push([name, value]);
  }
  out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

function walk(parent: Node, lines: string[]): void {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i += 1) {
    const child = children.item(i);
    if (child === null) continue;
    if (child.nodeType !== 1) continue; // Element nodes only.
    const el = child as Element;
    // Skip the injected stylesheet; its text is constant CSS, not scene state.
    if (el.tagName === "STYLE") continue;
    if (el instanceof HTMLElement) {
      lines.push(serializeElement(el));
    }
    if (el.childNodes.length > 0) {
      walk(el, lines);
    }
  }
}

function serializeElement(el: HTMLElement): string {
  const cls = el.className || "-";
  const style = el.style;
  const geometry = [
    style.display || "-",
    style.left || "-",
    style.top || "-",
    style.width || "-",
    style.height || "-",
  ].join(",");
  const dataAttrs = serializeDataAttrs(el);
  return `e\t${el.tagName.toLowerCase()}\t${cls}\t${geometry}\t${dataAttrs}`;
}

function serializeDataAttrs(el: HTMLElement): string {
  const attrs = el.dataset;
  const keys = Object.keys(attrs).sort();
  if (keys.length === 0) return "-";
  return keys.map((k) => `${k}=${attrs[k] ?? ""}`).join("|");
}

/**
 * FNV-1a 32-bit hash → lowercase hex. Dependency-free, deterministic, fast on
 * short text. Used as the `contentHash` so identical renders short-circuit the
 * diff at similarity 1.0 (matching hashes ⇒ authoritative, per ADR-011).
 */
function fnv1aHex(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    hash ^= ch;
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit then pad to 8 hex digits.
  return (hash >>> 0).toString(16).padStart(8, "0");
}
