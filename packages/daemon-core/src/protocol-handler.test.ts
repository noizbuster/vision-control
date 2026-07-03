import { NoopLogger } from "@vision-control/logger";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";
import { ProtocolHandler } from "./protocol-handler.js";

interface FakeSocket {
  readyState: number;
  OPEN: number;
  sent: string[];
  send: (data: string) => void;
  close: ReturnType<typeof vi.fn>;
}

function createFakeSocket(): FakeSocket {
  const sent: string[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    sent,
    send: (data: string) => {
      sent.push(data);
    },
    close: vi.fn(),
  };
}

function makeHandler(): ProtocolHandler {
  return new ProtocolHandler({
    logger: new NoopLogger(),
    now: () => 1_000,
    uuid: () => "msg-fixed-id",
  });
}

describe("ProtocolHandler", () => {
  it("responds to hello with a welcome envelope", async () => {
    const handler = makeHandler();
    const socket = createFakeSocket();
    const hello = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: "hello-0001",
      messageType: "hello",
      payload: {
        type: "hello",
        clientVersion: PROTOCOL_VERSION,
        clientCapabilities: ["selection", "verification", "error-reporting"],
      },
      timestamp: 1,
    };
    const result = await handler.handle(JSON.stringify(hello), socket as never);
    expect(result.ok).toBe(true);
    expect(socket.sent).toHaveLength(1);
    const welcome = JSON.parse(socket.sent[0] ?? "{}");
    expect(welcome.messageType).toBe("welcome");
    expect(welcome.payload.type).toBe("welcome");
    expect(welcome.payload.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects a version mismatch with an error envelope", async () => {
    const handler = makeHandler();
    const socket = createFakeSocket();
    const hello = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: "hello-0002",
      messageType: "hello",
      payload: {
        type: "hello",
        clientVersion: "999.0.0",
        clientCapabilities: ["selection"],
      },
      timestamp: 1,
    };
    const result = await handler.handle(JSON.stringify(hello), socket as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROTOCOL_VERSION_MISMATCH");
    }
    const sent = JSON.parse(socket.sent[0] ?? "{}");
    expect(sent.messageType).toBe("error");
  });

  it("returns an error envelope for invalid JSON", async () => {
    const handler = makeHandler();
    const socket = createFakeSocket();
    const result = await handler.handle("{not json", socket as never);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PAYLOAD");
    }
  });

  it("acks recognized non-hello messages", async () => {
    const handler = makeHandler();
    const socket = createFakeSocket();
    const selectionChanged = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: "sel-00001",
      messageType: "selection.changed",
      payload: {
        type: "selection.changed",
        elementId: "elem-abc",
        framePath: [],
      },
      timestamp: 1,
    };
    const result = await handler.handle(JSON.stringify(selectionChanged), socket as never);
    expect(result.ok).toBe(true);
    const sent = JSON.parse(socket.sent[0] ?? "{}");
    expect(sent.messageType).toBe("ack");
  });
});
