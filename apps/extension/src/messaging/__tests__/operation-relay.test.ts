import { OperationSchema } from "@vision-control/change-ir";
import { describe, expect, it, vi } from "vitest";

import type { MessageBus } from "../bus.js";
import { installBackgroundOperationRelay } from "../operation-relay.js";
import type { BusMessageHandler } from "../types.js";

function createRelayBus(): Pick<MessageBus, "on"> & {
  readonly handlers: Map<string, BusMessageHandler>;
} {
  const handlers = new Map<string, BusMessageHandler>();
  return {
    handlers,
    on: (messageType, handler) => {
      handlers.set(messageType, handler);
      return () => handlers.delete(messageType);
    },
  };
}

describe("background operation relay", () => {
  it("parses the operation and replaces a claimed tab with the Chrome sender tab", () => {
    // Given
    const bus = createRelayBus();
    const broadcastToPanel = vi.fn();
    installBackgroundOperationRelay({ bus, broadcastToPanel });
    const handler = bus.handlers.get("interaction-operation");
    expect(handler).toBeDefined();
    if (handler === undefined) return;

    // When
    handler(
      {
        protocolVersion: "1.0.0",
        messageId: "interaction-operation-trusted-tab",
        messageType: "interaction-operation",
        tabId: 999,
        targetRoute: "background",
        payload: {
          id: "op-trusted-tab",
          timestamp: 1_700_000_000_000,
          runtime: false,
          origin: "property-panel",
          confidence: 1,
          kind: "style-edit",
          target: { runtimeId: "element-a" },
          property: "color",
          value: "red",
          previousValue: "black",
          important: false,
          ignoredField: "must not cross the schema boundary",
        },
        timestamp: 1_700_000_000_000,
      },
      { route: "content", tabId: 41, frameId: 0 },
    );

    // Then
    expect(broadcastToPanel).toHaveBeenCalledOnce();
    const relayed = broadcastToPanel.mock.calls[0]?.[0];
    expect(relayed).toMatchObject({
      messageType: "interaction-operation",
      tabId: 41,
      sourceRoute: "background",
      targetRoute: "panel",
    });
    const parsed = OperationSchema.safeParse(relayed?.payload);
    expect(parsed.success).toBe(true);
    expect(relayed?.payload).not.toHaveProperty("ignoredField");
  });
});
