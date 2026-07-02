/**
 * Last-line-of-defense redaction for inspector summaries before export.
 */

import {
  DEFAULT_REDACTION_PATTERNS,
  type RedactionPattern,
  redactObject,
} from "@vision-control/security";

import type { SelectionSummary } from "./inspector-data.js";

/**
 * Deep-redact a {@link SelectionSummary} using the security layer.
 *
 * This is the boundary between the panel (which may keep live DOM references
 * and raw text previews) and any daemon/export consumer. The returned summary
 * is JSON-safe and stripped of secret-like substrings in text content,
 * attributes, class names, and any other string field.
 *
 * Live `Element` references in breadcrumb items are replaced by empty objects
 * during serialization; callers that need the handle must use the raw summary
 * from the panel builder, not the redacted export copy.
 */
export function redactInspectorSummary(
  summary: SelectionSummary,
  patterns: readonly RedactionPattern[] = DEFAULT_REDACTION_PATTERNS,
): SelectionSummary {
  const redacted = redactObject(summary, patterns);
  return redacted as SelectionSummary;
}
