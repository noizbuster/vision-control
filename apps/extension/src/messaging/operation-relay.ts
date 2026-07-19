import { type Operation, OperationSchema } from "@vision-control/change-ir";

import type { MessageBus } from "./bus.js";
import type { BusMessage, MessageContext } from "./types.js";

type ContentOperationMessageType = "interaction-operation" | "inspector-edit";

const CONTENT_OPERATION_MESSAGE_TYPES: readonly ContentOperationMessageType[] = [
  "interaction-operation",
  "inspector-edit",
];

function isContentOperationMessageType(
  messageType: string,
): messageType is ContentOperationMessageType {
  return messageType === "interaction-operation" || messageType === "inspector-edit";
}

export interface BackgroundOperationRelayOptions {
  readonly bus: Pick<MessageBus, "on">;
  readonly broadcastToPanel: (message: BusMessage) => void;
}

export interface PanelOperationSubscriptionOptions {
  readonly bus: Pick<MessageBus, "on">;
  readonly tabId: number;
  readonly record: (operation: Operation) => void;
}

export function createInteractionOperationMessage(operation: Operation): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `interaction-operation-${Date.now()}`,
    messageType: "interaction-operation",
    targetRoute: "background",
    payload: operation,
    timestamp: Date.now(),
  };
}

export function createTrustedPanelOperationMessage(
  message: BusMessage,
  senderTabId: number | undefined,
): BusMessage | null {
  if (senderTabId === undefined || !isContentOperationMessageType(message.messageType)) return null;
  const parsed = OperationSchema.safeParse(message.payload);
  if (!parsed.success) return null;
  return {
    protocolVersion: message.protocolVersion,
    messageId: message.messageId,
    messageType: message.messageType,
    tabId: senderTabId,
    sourceRoute: "background",
    targetRoute: "panel",
    payload: parsed.data,
    timestamp: message.timestamp,
  };
}

export function installBackgroundOperationRelay(
  options: BackgroundOperationRelayOptions,
): () => void {
  const unsubscribers = CONTENT_OPERATION_MESSAGE_TYPES.map((messageType) =>
    options.bus.on(messageType, (message, sender) => {
      if (sender.route !== "content" || message.targetRoute !== "background") return;
      const trustedMessage = createTrustedPanelOperationMessage(message, sender.tabId);
      if (trustedMessage !== null) options.broadcastToPanel(trustedMessage);
    }),
  );
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

export function subscribePanelOperations(options: PanelOperationSubscriptionOptions): () => void {
  const record = (message: BusMessage, sender: MessageContext): void => {
    if (
      sender.route !== "background" ||
      message.sourceRoute !== "background" ||
      message.tabId !== options.tabId
    ) {
      return;
    }
    const parsed = OperationSchema.safeParse(message.payload);
    if (!parsed.success) return;
    options.record(parsed.data);
  };
  const unsubscribers = CONTENT_OPERATION_MESSAGE_TYPES.map((messageType) =>
    options.bus.on(messageType, record),
  );
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
