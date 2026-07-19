import type { Operation } from "@vision-control/change-ir";

import type { LegacyOperationSummary } from "./operation-summary-schema.js";

export type LegacyOperation = Exclude<Operation, { readonly kind: "resize-flex-pair" }>;

export type LegacySummaryBody = {
  readonly description: string;
  readonly detail: Readonly<Record<string, string>>;
  readonly target: string | undefined;
};

export const buildLegacySummary = (
  operation: LegacyOperation,
  body: LegacySummaryBody,
): LegacyOperationSummary => ({
  id: operation.id,
  kind: operation.kind,
  runtime: operation.runtime,
  description: body.description,
  ...(body.target !== undefined ? { target: body.target } : {}),
  detail: { ...body.detail },
});

export const describeValue = (value: string): string => {
  const trimmed = value.length > 60 ? `${value.slice(0, 60)}…` : value;
  return `"${trimmed}"`;
};
