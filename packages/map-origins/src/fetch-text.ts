/**
 * Capped text fetch for source maps and stylesheets.
 *
 * Uses the injected {@link FetchLike} with per-fetch timeout. Never throws for
 * network / HTTP failures — returns a discriminated result so callers can skip
 * missing maps without aborting the whole compile.
 */

import { acceptMapBytes, type CapBudget, canStartMapFetch } from "./caps.js";
import type { FetchLike, MapCaps } from "./types.js";

/** Outcome of a single capped text fetch. */
export type FetchTextResult =
  | { readonly ok: true; readonly text: string; readonly byteLength: number }
  | {
      readonly ok: false;
      readonly reason: "missing" | "oversized" | "timeout" | "network" | "cap" | "empty";
    };

export interface FetchTextOptions {
  readonly fetch: FetchLike;
  readonly url: string;
  readonly caps: MapCaps;
  readonly budget: CapBudget;
  readonly now: () => number;
  /** When true, successful body counts against map caps. */
  readonly countTowardMapCaps: boolean;
}

/**
 * Fetch a URL as text under C4 caps.
 *
 * - Missing / non-OK / network / timeout → `{ ok: false }` (no throw).
 * - Oversized body or cap exhaustion → `{ ok: false, reason }` and may set
 *   `budget.truncated`.
 */
export const fetchTextCapped = async (options: FetchTextOptions): Promise<FetchTextResult> => {
  const { fetch: fetchImpl, url, caps, budget, now, countTowardMapCaps } = options;

  if (countTowardMapCaps && !canStartMapFetch(budget, caps, now())) {
    return { ok: false, reason: "cap" };
  }

  if (url.startsWith("data:")) {
    return decodeDataUrl(url, budget, caps, countTowardMapCaps);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, caps.fetchTimeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, reason: "missing" };
    }
    const text = await response.text();
    const byteLength = utf8ByteLength(text);
    if (countTowardMapCaps) {
      if (!acceptMapBytes(budget, caps, byteLength)) {
        return { ok: false, reason: "oversized" };
      }
    }
    if (text.length === 0) {
      return { ok: false, reason: "empty" };
    }
    return { ok: true, text, byteLength };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
};

const decodeDataUrl = (
  url: string,
  budget: CapBudget,
  caps: MapCaps,
  countTowardMapCaps: boolean,
): FetchTextResult => {
  const comma = url.indexOf(",");
  if (comma < 0) return { ok: false, reason: "missing" };
  const meta = url.slice(5, comma);
  const data = url.slice(comma + 1);
  let text: string;
  try {
    text = meta.includes(";base64") ? decodeBase64(data) : decodeURIComponent(data);
  } catch {
    return { ok: false, reason: "missing" };
  }
  const byteLength = utf8ByteLength(text);
  if (countTowardMapCaps) {
    if (!canStartMapFetch(budget, caps, budget.startedAt)) {
      return { ok: false, reason: "cap" };
    }
    if (!acceptMapBytes(budget, caps, byteLength)) {
      return { ok: false, reason: "oversized" };
    }
  }
  if (text.length === 0) return { ok: false, reason: "empty" };
  return { ok: true, text, byteLength };
};

const utf8ByteLength = (text: string): number => new TextEncoder().encode(text).length;

const decodeBase64 = (data: string): string => {
  if (typeof atob === "function") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  // Node test environment
  return Buffer.from(data, "base64").toString("utf8");
};

const isAbortError = (error: unknown): boolean => {
  if (error instanceof Error && error.name === "AbortError") return true;
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return false;
};
