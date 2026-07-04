/**
 * Content-side wiring for panel-driven edits.
 *
 * The content script is the single DOM applier: panel "editor-command" /
 * "clear-preview" messages (forwarded by the background) are routed here to the
 * overlay runtime's preview manager. Drag-based structural edits keep using the
 * same preview manager through the interaction controllers; this module extends
 * the apply surface to panel-emitted style/class/text/attribute/layout ops.
 */

import type { Operation } from "@vision-control/change-ir";

import type { OverlayRuntime, OverlayRuntimeBus } from "./overlay-runtime.js";

export interface ContentEditWiring {
  readonly dispose: () => void;
}

function isOperation(value: unknown): value is Operation {
  if (typeof value !== "object" || value === null) return false;
  const op = value as Record<string, unknown>;
  return typeof op.kind === "string" && typeof op.id === "string";
}

export function wireContentEditHandlers(
  bus: OverlayRuntimeBus,
  runtime: OverlayRuntime,
): ContentEditWiring {
  const editorCommandUnsub = bus.on("editor-command", (message) => {
    const payload = message.payload;
    if (!isOperation(payload)) return;
    runtime.applyOperation(payload);
  });

  const clearPreviewUnsub = bus.on("clear-preview", () => {
    runtime.clearPreviews();
  });

  return {
    dispose: () => {
      editorCommandUnsub();
      clearPreviewUnsub();
    },
  };
}
