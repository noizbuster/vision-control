import { describe, expect, it } from "vitest";

import {
  acceptMapBytes,
  canStartMapFetch,
  createCapBudget,
  DEFAULT_MAP_CAPS,
  resolveCaps,
} from "./caps.js";

describe("DEFAULT_MAP_CAPS (ADR-019 C4)", () => {
  it("matches the contract numbers", () => {
    expect(DEFAULT_MAP_CAPS.maxMaps).toBe(20);
    expect(DEFAULT_MAP_CAPS.maxBytesPerMap).toBe(1 * 1024 * 1024);
    expect(DEFAULT_MAP_CAPS.maxBytesTotal).toBe(2 * 1024 * 1024);
    expect(DEFAULT_MAP_CAPS.fetchTimeoutMs).toBe(500);
    expect(DEFAULT_MAP_CAPS.wallClockMs).toBe(2000);
  });
});

describe("canStartMapFetch", () => {
  it("allows the first map under default caps", () => {
    const budget = createCapBudget(0);
    expect(canStartMapFetch(budget, DEFAULT_MAP_CAPS, 0)).toBe(true);
    expect(budget.truncated).toBe(false);
  });

  it("rejects when maxMaps is reached and sets truncated", () => {
    const caps = resolveCaps({ maxMaps: 2 });
    const budget = createCapBudget(0);
    budget.mapsLoaded = 2;
    expect(canStartMapFetch(budget, caps, 0)).toBe(false);
    expect(budget.truncated).toBe(true);
  });

  it("rejects when wall clock is exceeded and sets truncated", () => {
    const caps = resolveCaps({ wallClockMs: 100 });
    const budget = createCapBudget(0);
    expect(canStartMapFetch(budget, caps, 100)).toBe(false);
    expect(budget.truncated).toBe(true);
  });
});

describe("acceptMapBytes", () => {
  it("accepts a map within per-map and total budgets", () => {
    const caps = resolveCaps({ maxBytesPerMap: 100, maxBytesTotal: 200 });
    const budget = createCapBudget(0);
    expect(acceptMapBytes(budget, caps, 50)).toBe(true);
    expect(budget.mapsLoaded).toBe(1);
    expect(budget.totalBytes).toBe(50);
  });

  it("rejects oversize per-map and sets truncated", () => {
    const caps = resolveCaps({ maxBytesPerMap: 10, maxBytesTotal: 1000 });
    const budget = createCapBudget(0);
    expect(acceptMapBytes(budget, caps, 11)).toBe(false);
    expect(budget.truncated).toBe(true);
    expect(budget.mapsLoaded).toBe(0);
  });

  it("rejects when total budget would be exceeded and sets truncated", () => {
    const caps = resolveCaps({ maxBytesPerMap: 100, maxBytesTotal: 100 });
    const budget = createCapBudget(0);
    expect(acceptMapBytes(budget, caps, 60)).toBe(true);
    expect(acceptMapBytes(budget, caps, 50)).toBe(false);
    expect(budget.truncated).toBe(true);
    expect(budget.mapsLoaded).toBe(1);
    expect(budget.totalBytes).toBe(60);
  });
});
