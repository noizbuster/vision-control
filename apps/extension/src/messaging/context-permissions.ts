import type { BusMessage, BusRoute, MessageContext } from "./types.js";

export type PermissionResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

const DAEMON_PREFIX = "daemon:";

function isDaemonMessage(message: BusMessage): boolean {
  return message.messageType.startsWith(DAEMON_PREFIX);
}

function senderRouteName(route: BusRoute | "unknown" | undefined): string {
  return route ?? "unknown";
}

/**
 * Enforce the extension's context-permission boundary.
 *
 * Hard rules:
 * - Content scripts are untrusted page context: they may NOT send daemon calls.
 * - Panels may only target the inspected tab they belong to; the message must
 *   carry the tab identity so the background router can enforce isolation.
 * - The background service worker is the only context permitted to send and
 *   receive daemon messages.
 */
export function checkSendPermission(sender: MessageContext, message: BusMessage): PermissionResult {
  if (sender.route === "content" && isDaemonMessage(message)) {
    return {
      allowed: false,
      reason: `content scripts cannot send daemon messages (${message.messageType})`,
    };
  }

  if (sender.route !== "background" && message.targetRoute === "daemon") {
    return {
      allowed: false,
      reason: `only background may route to daemon; sender=${senderRouteName(sender.route)}`,
    };
  }

  if (sender.route === "panel" && message.tabId === undefined) {
    return {
      allowed: false,
      reason: "panel messages must include tabId for isolation",
    };
  }

  if (
    sender.route === "content" &&
    message.tabId !== undefined &&
    sender.tabId !== undefined &&
    message.tabId !== sender.tabId
  ) {
    return {
      allowed: false,
      reason: `content script cannot target a different tab (${message.tabId} != ${sender.tabId})`,
    };
  }

  return { allowed: true };
}
