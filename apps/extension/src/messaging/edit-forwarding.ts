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
  readonly isUrlAllowed?: (url: string | undefined) => boolean;
  readonly sendToFrame: (tabId: number, frameId: number, message: BusMessage) => void;
}

export type EditForwarder = (message: BusMessage) => void;

function pickRouteableFrame(
  frames: readonly {
    readonly frameId: number;
    readonly routeable: boolean;
    readonly url?: string | undefined;
  }[],
  isUrlAllowed: (url: string | undefined) => boolean,
): { readonly frameId: number } | null {
  const top = frames.find((f) => f.frameId === 0 && f.routeable && isUrlAllowed(f.url));
  if (top !== undefined) return { frameId: top.frameId };
  const firstRouteable = frames.find((f) => f.routeable && isUrlAllowed(f.url));
  if (firstRouteable !== undefined) return { frameId: firstRouteable.frameId };
  return null;
}

function allowEveryUrl(_url: string | undefined): boolean {
  return true;
}

export function createEditForwarder(options: EditForwarderOptions): EditForwarder {
  const { store, sendToFrame } = options;
  const isUrlAllowed = options.isUrlAllowed ?? allowEveryUrl;

  return (message: BusMessage): void => {
    const tabId = message.tabId;
    if (tabId === undefined) return;

    const session = store.get(tabId);
    if (session === undefined) return;

    const target = pickRouteableFrame(session.frameTree, isUrlAllowed);
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
