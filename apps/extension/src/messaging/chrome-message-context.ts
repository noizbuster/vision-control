import type { BusRoute, MessageContext } from "./types.js";

interface ChromeMessageContextSender {
  readonly frameId?: number | undefined;
  readonly tab?: { readonly id?: number | undefined } | undefined;
  readonly url?: string | undefined;
}

function isExtensionDocument(sender: ChromeMessageContextSender): boolean {
  return sender.url?.startsWith("chrome-extension://") ?? false;
}

export function createChromeMessageContext(
  sender: ChromeMessageContextSender,
  claimedRoute?: BusRoute,
  sessionId?: string,
): MessageContext {
  const tabId = sender.tab?.id;
  const route =
    isExtensionDocument(sender) && claimedRoute !== undefined
      ? claimedRoute
      : tabId === undefined
        ? (claimedRoute ?? "unknown")
        : "content";
  return {
    route,
    tabId,
    frameId: sender.frameId,
    sessionId,
  };
}
