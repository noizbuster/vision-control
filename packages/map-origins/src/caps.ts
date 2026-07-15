/**
 * ADR-019 C4 map-fetch caps and a mutable tracker for one selection compile.
 */

import type { MapCaps } from "./types.js";

/** Default C4 caps: 20 maps, 1 MiB each, 2 MiB total, 500 ms fetch, 2 s wall. */
export const DEFAULT_MAP_CAPS: MapCaps = {
  maxMaps: 20,
  maxBytesPerMap: 1 * 1024 * 1024,
  maxBytesTotal: 2 * 1024 * 1024,
  fetchTimeoutMs: 500,
  wallClockMs: 2000,
} as const;

/** Alias used in public docs and imports. */
export const MAP_CAPS = DEFAULT_MAP_CAPS;

/** Mutable budget for one resolve pass. */
export interface CapBudget {
  mapsLoaded: number;
  totalBytes: number;
  readonly startedAt: number;
  truncated: boolean;
}

/** Create a fresh budget at `startedAt` (epoch ms). */
export const createCapBudget = (startedAt: number): CapBudget => ({
  mapsLoaded: 0,
  totalBytes: 0,
  startedAt,
  truncated: false,
});

/** Merge partial overrides onto {@link DEFAULT_MAP_CAPS}. */
export const resolveCaps = (partial?: Partial<MapCaps>): MapCaps => ({
  maxMaps: partial?.maxMaps ?? DEFAULT_MAP_CAPS.maxMaps,
  maxBytesPerMap: partial?.maxBytesPerMap ?? DEFAULT_MAP_CAPS.maxBytesPerMap,
  maxBytesTotal: partial?.maxBytesTotal ?? DEFAULT_MAP_CAPS.maxBytesTotal,
  fetchTimeoutMs: partial?.fetchTimeoutMs ?? DEFAULT_MAP_CAPS.fetchTimeoutMs,
  wallClockMs: partial?.wallClockMs ?? DEFAULT_MAP_CAPS.wallClockMs,
});

/**
 * Whether another map may be loaded under count + wall-clock caps.
 * Byte caps are checked after the body size is known.
 */
export const canStartMapFetch = (budget: CapBudget, caps: MapCaps, nowMs: number): boolean => {
  if (budget.truncated) return false;
  if (budget.mapsLoaded >= caps.maxMaps) {
    budget.truncated = true;
    return false;
  }
  if (nowMs - budget.startedAt >= caps.wallClockMs) {
    budget.truncated = true;
    return false;
  }
  return true;
};

/**
 * Whether `byteLength` fits per-map and total budgets. On failure marks
 * `truncated` when the map would have been useful but is over budget.
 */
export const acceptMapBytes = (budget: CapBudget, caps: MapCaps, byteLength: number): boolean => {
  if (byteLength > caps.maxBytesPerMap) {
    budget.truncated = true;
    return false;
  }
  if (budget.totalBytes + byteLength > caps.maxBytesTotal) {
    budget.truncated = true;
    return false;
  }
  budget.mapsLoaded += 1;
  budget.totalBytes += byteLength;
  return true;
};
