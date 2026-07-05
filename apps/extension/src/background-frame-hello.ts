import type { BusMessage, FrameInfo, MessageContext, TabSession } from "./messaging/index.js";

export type FrameHelloStore = {
  readonly ensure: (tabId: number) => TabSession;
  readonly updateFrameTree: (tabId: number, frameTree: readonly FrameInfo[]) => void;
};

export type FrameHelloOptions = {
  readonly store: FrameHelloStore;
  readonly isUrlAllowed: (url: string | undefined) => boolean;
};

type FrameHelloPayload = {
  readonly origin: string;
  readonly url: string;
};

function readFrameHelloPayload(payload: unknown): FrameHelloPayload {
  if (typeof payload !== "object" || payload === null) {
    return { origin: "", url: "" };
  }
  const candidate: { readonly origin?: unknown; readonly url?: unknown } = payload;
  return {
    origin: typeof candidate.origin === "string" ? candidate.origin : "",
    url: typeof candidate.url === "string" ? candidate.url : "",
  };
}

export function handleFrameHello(
  message: BusMessage,
  sender: MessageContext,
  options: FrameHelloOptions,
): void {
  const tabId = sender.tabId ?? message.tabId;
  const frameId = sender.frameId;
  if (tabId === undefined || frameId === undefined) {
    return;
  }

  const payload = readFrameHelloPayload(message.payload);
  if (!options.isUrlAllowed(payload.url)) {
    return;
  }

  const session = options.store.ensure(tabId);
  const existing = session.frameTree.find((frame) => frame.frameId === frameId);
  if (existing !== undefined) {
    return;
  }

  const topFrame = session.frameTree.find((frame) => frame.frameId === 0);
  const topOrigin = topFrame?.origin ?? payload.origin;
  const frame: FrameInfo = {
    frameId,
    url: payload.url,
    origin: payload.origin,
    routeable: payload.origin.length > 0 && payload.origin === topOrigin,
  };
  options.store.updateFrameTree(tabId, [...session.frameTree, frame]);
}
