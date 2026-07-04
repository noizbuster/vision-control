/**
 * Resolves a panel-emitted edit message to the inspected tab's routeable content
 * frame and forwards it with targetRoute:"content" so the content bus accepts it.
 *
 * Extracted from the background entrypoint so the routing decision (tab ->
 * routeable frame -> forwarded envelope) is unit-testable without chrome APIs.
 * The entrypoint wires the real `chrome.tabs.sendMessage` into `sendToFrame`.
 */

import type { TabSessionStore } from "./tab-session.js";
import type { BusMessage } from "./types.js";

export interface EditForwarderOptions {
  readonly store: TabSessionStore;
  readonly sendToFrame: (tabId: number, frameId: number, message: BusMessage) => void;
}

export type EditForwarder = (message: BusMessage) => void;

function pickRouteableFrame(
  frames: readonly { readonly frameId: number; readonly routeable: boolean }[],
): { readonly frameId: number } | null {
  const top = frames.find((f) => f.frameId === 0 && f.routeable);
  if (top !== undefined) return { frameId: top.frameId };
  const firstRouteable = frames.find((f) => f.routeable);
  if (firstRouteable !== undefined) return { frameId: firstRouteable.frameId };
  return null;
}

export function createEditForwarder(options: EditForwarderOptions): EditForwarder {
  const { store, sendToFrame } = options;

  return (message: BusMessage): void => {
    const tabId = message.tabId;
    if (tabId === undefined) return;

    const session = store.get(tabId);
    if (session === undefined) return;

    const target = pickRouteableFrame(session.frameTree);
    if (target === null) return;

    const frameId = target.frameId;
    const forwarded: BusMessage = {
      ...message,
      targetRoute: "content",
      tabId,
      frameId,
    };
    sendToFrame(tabId, frameId, forwarded);
  };
}
