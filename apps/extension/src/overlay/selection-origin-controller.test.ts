import type { SelectionSummary } from "@vision-control/inspector-core";
import { describe, expect, it, vi } from "vitest";

import { createSelectionSummaryFixture } from "../testing/selection-summary-fixture.js";
import {
  createSelectionOriginController,
  type SelectionOriginControllerOptions,
} from "./selection-origin-controller.js";

type Deferred<T> = {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolvePromise = (_value: T): void => {};
  let rejectPromise = (_reason: unknown): void => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function createHarness(): {
  readonly options: SelectionOriginControllerOptions;
  readonly pending: Deferred<{
    readonly origins: readonly {
      readonly relativePath: string;
      readonly confidence: "high";
      readonly warnings: readonly string[];
    }[];
    readonly originsTruncated: boolean;
  }>[];
  readonly summaries: { readonly summary: SelectionSummary; readonly revision: number }[];
  readonly origins: {
    readonly runtimeId: string;
    readonly revision: number;
    readonly originCount: number;
    readonly originsTruncated: boolean;
  }[];
  readonly clears: number[];
  readonly invalidations: number[];
} {
  const pending: ReturnType<
    typeof deferred<{
      readonly origins: readonly {
        readonly relativePath: string;
        readonly confidence: "high";
        readonly warnings: readonly string[];
      }[];
      readonly originsTruncated: boolean;
    }>
  >[] = [];
  const summaries: { summary: SelectionSummary; revision: number }[] = [];
  const origins: {
    runtimeId: string;
    revision: number;
    originCount: number;
    originsTruncated: boolean;
  }[] = [];
  const clears: number[] = [];
  const invalidations: number[] = [];
  return {
    pending,
    summaries,
    origins,
    clears,
    invalidations,
    options: {
      resolve: () => {
        const next = deferred<{
          readonly origins: readonly {
            readonly relativePath: string;
            readonly confidence: "high";
            readonly warnings: readonly string[];
          }[];
          readonly originsTruncated: boolean;
        }>();
        pending.push(next);
        return next.promise;
      },
      publishSummary: (summary, revision) => summaries.push({ summary, revision }),
      publishOrigins: (payload, revision) =>
        origins.push({
          runtimeId: payload.runtimeId,
          revision,
          originCount: payload.origins.length,
          originsTruncated: payload.originsTruncated,
        }),
      publishClear: (revision) => clears.push(revision),
      publishInvalidated: (revision) => invalidations.push(revision),
    },
  };
}

function select(
  controller: ReturnType<typeof createSelectionOriginController>,
  summary = createSelectionSummaryFixture(),
): void {
  controller.select({
    element: document.createElement("button"),
    runtimeId: summary.identity.runtimeId ?? "runtime-missing",
    summary,
  });
}

describe("selection origin controller", () => {
  it("publishes summary and origins with the same monotonic revision", async () => {
    const harness = createHarness();
    const controller = createSelectionOriginController(harness.options);

    select(controller);
    harness.pending[0]?.resolve({
      origins: [{ relativePath: "src/Button.tsx", confidence: "high", warnings: [] }],
      originsTruncated: true,
    });
    await Promise.resolve();

    expect(harness.summaries.map((entry) => entry.revision)).toEqual([1]);
    expect(harness.origins).toEqual([
      { runtimeId: "runtime-1", revision: 1, originCount: 1, originsTruncated: true },
    ]);
  });

  it("treats same-element reselection as a new revision and drops the old completion", async () => {
    const harness = createHarness();
    const controller = createSelectionOriginController(harness.options);
    const summary = createSelectionSummaryFixture();

    select(controller, summary);
    select(controller, summary);
    harness.pending[0]?.resolve({ origins: [], originsTruncated: false });
    await Promise.resolve();
    harness.pending[1]?.resolve({ origins: [], originsTruncated: false });
    await Promise.resolve();

    expect(harness.summaries.map((entry) => entry.revision)).toEqual([1, 2]);
    expect(harness.origins.map((entry) => entry.revision)).toEqual([2]);
  });

  it.each([
    [
      "deselect",
      (controller: ReturnType<typeof createSelectionOriginController>) => controller.clear(),
    ],
    [
      "stop",
      (controller: ReturnType<typeof createSelectionOriginController>) => controller.invalidate(),
    ],
    [
      "dispose",
      (controller: ReturnType<typeof createSelectionOriginController>) => controller.dispose(),
    ],
  ])("drops an old completion after %s", async (_name, invalidate) => {
    const harness = createHarness();
    const controller = createSelectionOriginController(harness.options);
    select(controller);

    invalidate(controller);
    harness.pending[0]?.resolve({ origins: [], originsTruncated: false });
    await Promise.resolve();

    expect(harness.origins).toEqual([]);
  });

  it("publishes ready empty origins when the current resolver rejects", async () => {
    const harness = createHarness();
    const controller = createSelectionOriginController(harness.options);
    select(controller);

    harness.pending[0]?.reject(new TypeError("map unavailable"));
    await Promise.resolve();

    expect(harness.origins).toEqual([
      { runtimeId: "runtime-1", revision: 1, originCount: 0, originsTruncated: false },
    ]);
  });

  it("publishes a monotonic clear revision after deselection", () => {
    const harness = createHarness();
    const controller = createSelectionOriginController(harness.options);
    select(controller);

    controller.clear();

    expect(harness.clears).toEqual([2]);
  });

  it("publishes a monotonic invalidation revision when the runtime stops", () => {
    const harness = createHarness();
    const controller = createSelectionOriginController(harness.options);
    select(controller);

    controller.invalidate();

    expect(harness.invalidations).toEqual([2]);
  });

  it("does not publish a stale resolver rejection", async () => {
    const harness = createHarness();
    const publishOrigins = vi.spyOn(harness.options, "publishOrigins");
    const controller = createSelectionOriginController(harness.options);
    select(controller);
    select(controller, createSelectionSummaryFixture("runtime-2"));

    harness.pending[0]?.reject(new TypeError("stale map unavailable"));
    await Promise.resolve();

    expect(publishOrigins).not.toHaveBeenCalled();
  });
});
