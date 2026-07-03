/**
 * screenshot-retention tests (VC-V1V2-15 / ADR-011).
 *
 * Short local retention default (24h), expiry computation, and the cleanup
 * sweep that expires + deletes artifacts past retention. The sweep runs against
 * a structural repository interface so verification-engine stays free of the
 * node-only storage package.
 */

import { describe, expect, it } from "vitest";

import {
  computeExpiry,
  DEFAULT_RETENTION_POLICY,
  DEFAULT_SCREENSHOT_RETENTION_MS,
  type RetentionSweepRepository,
  runRetentionCleanup,
} from "./screenshot-retention.js";

function fakeRepo(rows: { id: string; file_path: string }[]): {
  repo: RetentionSweepRepository;
  deletedIds: string[];
  listCalls: number[];
} {
  const deletedIds: string[] = [];
  const listCalls: number[] = [];
  const store = new Map(rows.map((r) => [r.id, r.file_path]));
  return {
    deletedIds,
    listCalls,
    repo: {
      listExpired(now) {
        listCalls.push(now);
        return [...rows].filter((r) => store.has(r.id));
      },
      delete(id) {
        store.delete(id);
        deletedIds.push(id);
      },
    },
  };
}

describe("retention policy", () => {
  it("defaults to 24 hours", () => {
    expect(DEFAULT_SCREENSHOT_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
    expect(DEFAULT_RETENTION_POLICY.retentionMs).toBe(DEFAULT_SCREENSHOT_RETENTION_MS);
  });

  it("computeExpiry adds the retention window to the capture time", () => {
    expect(computeExpiry(1000)).toBe(1000 + DEFAULT_SCREENSHOT_RETENTION_MS);
    expect(computeExpiry(1000, { retentionMs: 60_000 })).toBe(61_000);
  });

  it("computeExpiry with zero retention returns the capture time", () => {
    expect(computeExpiry(5000, { retentionMs: 0 })).toBe(5000);
  });

  it("rejects a negative retention window", () => {
    expect(() => computeExpiry(0, { retentionMs: -1 })).toThrow();
  });
});

describe("runRetentionCleanup", () => {
  it("deletes expired rows + their files, returns the deleted set", () => {
    const deletedPaths: string[] = [];
    const { repo, deletedIds } = fakeRepo([
      { id: "shot-1", file_path: "shots/a.png" },
      { id: "shot-2", file_path: "shots/b.png" },
    ]);
    const result = runRetentionCleanup(repo, 9_999, (p) => deletedPaths.push(p));
    expect(result.deletedCount).toBe(2);
    expect(result.deletedIds).toEqual(["shot-1", "shot-2"]);
    expect(deletedIds).toEqual(["shot-1", "shot-2"]);
    expect(result.deletedPaths).toEqual(["shots/a.png", "shots/b.png"]);
    expect(deletedPaths).toEqual(["shots/a.png", "shots/b.png"]);
  });

  it("queries the repository with the supplied `now`", () => {
    const { repo, listCalls } = fakeRepo([{ id: "shot-1", file_path: "shots/a.png" }]);
    runRetentionCleanup(repo, 42_000, () => {});
    expect(listCalls).toEqual([42_000]);
  });

  it("is a no-op when nothing is expired", () => {
    const { repo } = fakeRepo([]);
    const result = runRetentionCleanup(repo, 1_000, () => {});
    expect(result.deletedCount).toBe(0);
    expect(result.deletedIds).toEqual([]);
  });

  it("records a failed delete without aborting the rest of the sweep", () => {
    const deletedPaths: string[] = [];
    const { repo } = fakeRepo([
      { id: "shot-1", file_path: "shots/a.png" },
      { id: "shot-2", file_path: "shots/bad.png" },
      { id: "shot-3", file_path: "shots/c.png" },
    ]);
    const result = runRetentionCleanup(repo, 9_999, (p) => {
      if (p === "shots/bad.png") throw new Error("EACCES");
      deletedPaths.push(p);
    });
    expect(result.deletedCount).toBe(2);
    expect(result.failedDeletes).toHaveLength(1);
    expect(result.failedDeletes[0]?.id).toBe("shot-2");
    expect(result.failedDeletes[0]?.reason).toContain("EACCES");
    // The bad row was NOT deleted (file delete failed before row delete).
    expect(deletedPaths).toEqual(["shots/a.png", "shots/c.png"]);
  });
});
