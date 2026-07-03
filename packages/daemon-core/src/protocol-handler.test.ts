import { NoopLogger } from "@vision-control/logger";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";
import { type MessageSender, ProtocolHandler, type ProtocolHandlerDeps } from "./index.js";

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

function envelope(
  messageId: string,
  messageType: string,
  payload: Record<string, unknown>,
): string {
  return JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    messageId,
    messageType,
    payload,
    timestamp: 1,
  });
}

function makeHandler(overrides: Partial<ProtocolHandlerDeps> = {}): ProtocolHandler {
  return new ProtocolHandler({
    logger: new NoopLogger(),
    now: () => 1_000,
    uuid: () => "msg-fixed-id",
    ...overrides,
  });
}

describe("ProtocolHandler", () => {
  it("responds to hello with a welcome envelope", async () => {
    const handler = makeHandler();
    const socket = createFakeSocket();
    const result = await handler.handle(
      envelope("hello-0001", "hello", {
        type: "hello",
        clientVersion: PROTOCOL_VERSION,
        clientCapabilities: ["selection", "verification", "error-reporting"],
      }),
      socket as never,
    );
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
    const result = await handler.handle(
      envelope("hello-0002", "hello", {
        type: "hello",
        clientVersion: "999.0.0",
        clientCapabilities: ["selection"],
      }),
      socket as never,
    );
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

  // ── §25.1 typed dispatch ──────────────────────────────────────────────────

  it("routes selection.changed to deps.onSelectionChanged with the parsed payload and acks", async () => {
    const onSelectionChanged = vi.fn();
    const handler = makeHandler({ onSelectionChanged });
    const socket = createFakeSocket();
    const result = await handler.handle(
      envelope("sel-00001", "selection.changed", {
        type: "selection.changed",
        elementId: "elem-abc",
        framePath: ["main"],
      }),
      socket as never,
    );
    expect(result.ok).toBe(true);
    expect(onSelectionChanged).toHaveBeenCalledTimes(1);
    const [payload, sender] = onSelectionChanged.mock.calls[0] ?? [];
    expect(payload).toStrictEqual({
      type: "selection.changed",
      elementId: "elem-abc",
      framePath: ["main"],
    });
    expect(sender).toBeDefined();
    const ack = JSON.parse(socket.sent[0] ?? "{}");
    expect(ack.messageType).toBe("ack");
    expect(ack.correlationId).toBe("sel-00001");
  });

  it("lets a source.request handler emit source.resolved via the sender, then acks", async () => {
    const onSourceRequest = vi.fn((_payload: unknown, sender: MessageSender) => {
      sender.sendSourceResolved({
        requestId: "req-1",
        elementId: "elem-abc",
        sourceToken: "tok-xyz",
        confidence: "high",
      });
    });
    const handler = makeHandler({ onSourceRequest });
    const socket = createFakeSocket();
    const result = await handler.handle(
      envelope("src-00001", "source.request", {
        type: "source.request",
        requestId: "req-1",
        elementId: "elem-abc",
      }),
      socket as never,
    );
    expect(result.ok).toBe(true);
    expect(onSourceRequest).toHaveBeenCalledTimes(1);
    expect(socket.sent).toHaveLength(2);
    const resolved = JSON.parse(socket.sent[0] ?? "{}");
    expect(resolved.messageType).toBe("source.resolved");
    expect(resolved.payload).toStrictEqual({
      type: "source.resolved",
      requestId: "req-1",
      elementId: "elem-abc",
      sourceToken: "tok-xyz",
      confidence: "high",
    });
    expect(resolved.correlationId).toBe("src-00001");
    const ack = JSON.parse(socket.sent[1] ?? "{}");
    expect(ack.messageType).toBe("ack");
    expect(ack.correlationId).toBe("src-00001");
  });

  it("returns an error envelope (no crash) for an unknown message type", async () => {
    const handler = makeHandler();
    const socket = createFakeSocket();
    const result = await handler.handle(
      envelope("unk-00001", "totally.unknown", { type: "totally.unknown" }),
      socket as never,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_MESSAGE_TYPE");
    }
    const sent = JSON.parse(socket.sent[0] ?? "{}");
    expect(sent.messageType).toBe("error");
    expect(sent.payload.code).toBe("UNKNOWN_MESSAGE_TYPE");
    expect(sent.correlationId).toBe("unk-00001");
  });

  it("turns a throwing handler into an INTERNAL_ERROR envelope without crashing", async () => {
    const onDiagnosticReported = vi.fn(() => {
      throw new Error("boom");
    });
    const handler = makeHandler({ onDiagnosticReported });
    const socket = createFakeSocket();
    const result = await handler.handle(
      envelope("diag-00001", "diagnostic.reported", {
        type: "diagnostic.reported",
        severity: "error",
        message: "x",
      }),
      socket as never,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL_ERROR");
    }
    const sent = JSON.parse(socket.sent[0] ?? "{}");
    expect(sent.messageType).toBe("error");
    expect(sent.payload.code).toBe("INTERNAL_ERROR");
  });

  it("acks each §25.1 message with no handlers wired (default no-ops do not crash)", async () => {
    const cases: ReadonlyArray<{
      readonly messageId: string;
      readonly payload: Record<string, unknown>;
    }> = [
      { messageId: "sh-000001", payload: { type: "session.hello", tabId: "tab-1" } },
      { messageId: "hb-000001", payload: { type: "session.heartbeat", clientTime: 1 } },
      {
        messageId: "pn-000001",
        payload: { type: "page.navigated", url: "https://x", title: "t", framePath: [] },
      },
      {
        messageId: "sc-000001",
        payload: { type: "selection.changed", elementId: "e", framePath: [] },
      },
      {
        messageId: "cu-000001",
        payload: { type: "changeset.updated", changesetId: "c", revision: 0, operations: [] },
      },
      {
        messageId: "sr-000001",
        payload: { type: "source.request", requestId: "r", elementId: "e" },
      },
      {
        messageId: "vr-000001",
        payload: { type: "verification.runtimeResult", changesetId: "c", passed: true },
      },
      {
        messageId: "dr-000001",
        payload: { type: "diagnostic.reported", severity: "info", message: "m" },
      },
    ];

    for (const { messageId, payload } of cases) {
      const handler = makeHandler();
      const socket = createFakeSocket();
      const result = await handler.handle(
        envelope(messageId, payload.type as string, payload),
        socket as never,
      );
      expect(result.ok, `message ${payload.type}`).toBe(true);
      expect(socket.sent, `message ${payload.type}`).toHaveLength(1);
      const ack = JSON.parse(socket.sent[0] ?? "{}");
      expect(ack.messageType).toBe("ack");
      expect(ack.correlationId).toBe(messageId);
    }
  });
});
