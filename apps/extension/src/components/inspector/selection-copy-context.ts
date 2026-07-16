import {
  compileVisionContextSnapshot,
  projectSelectionToTarget,
  VisionContextSnapshotSchema,
} from "@vision-control/context-compiler";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type { MapOrigin } from "@vision-control/map-origins";
import { redactString } from "@vision-control/security";

export interface SelectionCopyContextInput {
  readonly pageUrl: string | null;
  readonly selection: SelectionSummary;
  readonly origins: readonly MapOrigin[];
  readonly originsTruncated: boolean;
}

export function serializeSelectionCopyContext(input: SelectionCopyContextInput): string {
  const snapshot = VisionContextSnapshotSchema.parse(
    compileVisionContextSnapshot({
      snapshotRev: 0,
      selection: projectSelectionToTarget(input.selection),
      origins: input.origins.map((origin) => ({
        ...origin,
        warnings: [...origin.warnings],
      })),
      originsTruncated: input.originsTruncated,
    }),
  );
  const selection = snapshot.selection;
  const pageUrl = input.pageUrl === null ? null : redactString(input.pageUrl);

  return [
    "vision-control-selection/v1",
    entry("page_url", pageUrl),
    entry("selector", selection?.identity.selectors[0] ?? null),
    entry("identity", selection?.identity ?? null),
    entry("semantic", selection?.semantic ?? null),
    entry("breadcrumb", selection?.breadcrumb ?? []),
    entry("origins", snapshot.origins),
    entry("origins_truncated", snapshot.originsTruncated),
  ].join("\n");
}

function entry(key: string, value: unknown): string {
  return `${key}: ${JSON.stringify(value)}`;
}
