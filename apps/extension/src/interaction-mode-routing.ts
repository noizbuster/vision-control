import type { InteractionMode } from "@vision-control/overlay-ui";

import type { EditorMode } from "./hooks/useEditor.js";
import type { FrameInfo, MessageBus } from "./messaging/index.js";
import { createInteractionModeMessage } from "./messaging/index.js";

const INTERACTION_MODES: ReadonlySet<string> = new Set([
  "Inspect",
  "Move",
  "Resize",
  "Text",
  "Layout",
]);

export function isPanelInteractionMode(mode: EditorMode): mode is InteractionMode {
  return typeof mode === "string" && INTERACTION_MODES.has(mode);
}

export function sendInteractionModeToRouteableFrames(
  bus: Pick<MessageBus, "send"> | undefined,
  tabId: number | null | undefined,
  frames: readonly FrameInfo[],
  mode: InteractionMode | null,
): void {
  if (bus === undefined || tabId === undefined || tabId === null) return;
  const routeableFrames = frames.filter((frame) => frame.routeable);
  const targetFrameIds =
    routeableFrames.length > 0 ? routeableFrames.map((frame) => frame.frameId) : [0];
  for (const frameId of targetFrameIds) {
    bus.send("content", createInteractionModeMessage(mode, tabId, frameId));
  }
}
