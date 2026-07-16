import type { SelectionSummary } from "@vision-control/inspector-core";

import type { SelectionOriginsPayload } from "../messaging/panel-messages.js";
import type { SelectionOriginsResult } from "./resolve-selection-origins.js";

export type SelectionOriginResolver = (element: Element) => Promise<SelectionOriginsResult>;

export interface SelectionOriginControllerOptions {
  readonly resolve: SelectionOriginResolver;
  readonly publishSummary: (summary: SelectionSummary, selectionRevision: number) => void;
  readonly publishOrigins: (payload: SelectionOriginsPayload, selectionRevision: number) => void;
  readonly publishClear: (selectionRevision: number) => void;
  readonly publishInvalidated: (selectionRevision: number) => void;
}

export interface SelectionOriginController {
  readonly select: (selection: {
    readonly element: Element;
    readonly runtimeId: string;
    readonly summary: SelectionSummary;
  }) => void;
  readonly clear: () => void;
  readonly invalidate: () => void;
  readonly dispose: () => void;
}

export function createSelectionOriginController(
  options: SelectionOriginControllerOptions,
): SelectionOriginController {
  let selectionRevision = 0;
  let disposed = false;

  const isCurrent = (revision: number): boolean => !disposed && revision === selectionRevision;

  const select: SelectionOriginController["select"] = ({ element, runtimeId, summary }) => {
    if (disposed) return;

    selectionRevision += 1;
    const revision = selectionRevision;
    options.publishSummary(summary, revision);

    void options.resolve(element).then(
      (result) => {
        if (!isCurrent(revision)) return;
        options.publishOrigins(
          {
            runtimeId,
            origins: result.origins,
            originsTruncated: result.originsTruncated,
          },
          revision,
        );
      },
      () => {
        if (!isCurrent(revision)) return;
        options.publishOrigins({ runtimeId, origins: [], originsTruncated: false }, revision);
      },
    );
  };

  const clear = (): void => {
    if (disposed) return;
    selectionRevision += 1;
    options.publishClear(selectionRevision);
  };

  const invalidate = (): void => {
    if (disposed) return;
    selectionRevision += 1;
    options.publishInvalidated(selectionRevision);
  };

  const dispose = (): void => {
    if (disposed) return;
    selectionRevision += 1;
    disposed = true;
  };

  return { select, clear, invalidate, dispose };
}
