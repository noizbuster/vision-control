import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { describe, expect, it } from "vitest";
import { computeBackoffDelay, DaemonClient, type WebSocketLike } from "./client.js";
import {
  buildPairingHttpUrl,
  parsePairingUrl,
  synthesizePairingUrlFromHttpPairPage,
  toWebSocketUrl,
} from "./pairing.js";

const TARGET = { token: "tok-abc", host: "127.0.0.1", port: 4321 };

describe("parsePairingUrl", () => {
  it("parses a valid vision-control://pair URL", () => {
    const result = parsePairingUrl("vision-control://pair?token=abc&port=8080&host=127.0.0.1");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.target.token).toBe("abc");
      expect(result.target.port).toBe(8080);
      expect(result.target.host).toBe("127.0.0.1");
    }
  });

  it("fails on a wrong scheme", () => {
    expect(parsePairingUrl("https://pair?token=abc&port=8080").success).toBe(false);
  });

  it("still rejects http: pairing pages (scheme gate intact)", () => {
    const httpPair =
      "http://127.0.0.1:4321/pair?token=tok-abc&port=4321&host=127.0.0.1";
    expect(parsePairingUrl(httpPair).success).toBe(false);
  });

  it("fails when the token is missing", () => {
    expect(parsePairingUrl("vision-control://pair?port=8080").success).toBe(false);
  });

  it("fails on an invalid port", () => {
    expect(parsePairingUrl("vision-control://pair?token=x&port=abc").success).toBe(false);
  });
});

describe("toWebSocketUrl", () => {
  it("builds a ws:// url with the token query", () => {
    expect(toWebSocketUrl(TARGET)).toBe("ws://127.0.0.1:4321/?token=tok-abc");
  });
});

describe("buildPairingHttpUrl", () => {
  it("builds a loopback /pair URL with encoded token and bind host in query", () => {
    const result = buildPairingHttpUrl({
      token: "tok/with spaces+&",
      port: 4321,
      host: "127.0.0.1",
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const parsed = new URL(result.url);
    expect(parsed.protocol).toBe("http:");
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.port).toBe("4321");
    expect(parsed.pathname).toBe("/pair");
    expect(parsed.searchParams.get("token")).toBe("tok/with spaces+&");
    expect(parsed.searchParams.get("port")).toBe("4321");
    expect(parsed.searchParams.get("host")).toBe("127.0.0.1");
  });

  it("always navigates via 127.0.0.1 while preserving bind host in query", () => {
    const result = buildPairingHttpUrl({
      token: "tok-abc",
      port: 9999,
      host: "localhost",
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    const parsed = new URL(result.url);
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.searchParams.get("host")).toBe("localhost");
  });

  it("refuses non-loopback hosts", () => {
    const result = buildPairingHttpUrl({
      token: "tok-abc",
      port: 4321,
      host: "evil.com",
    });
    expect(result.success).toBe(false);
  });

  it("refuses empty token", () => {
    const result = buildPairingHttpUrl({
      token: "",
      port: 4321,
      host: "127.0.0.1",
    });
    expect(result.success).toBe(false);
  });
});

describe("synthesizePairingUrlFromHttpPairPage", () => {
  it("synthesizes a parseable vision-control:// URL from a loopback http pair page", () => {
    const httpUrl =
      "http://127.0.0.1:4321/pair?token=tok-abc&port=4321&host=127.0.0.1";
    const result = synthesizePairingUrlFromHttpPairPage(httpUrl);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.pairingUrl).toBe(
      "vision-control://pair?token=tok-abc&port=4321&host=127.0.0.1",
    );
    const parsed = parsePairingUrl(result.pairingUrl);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.target).toEqual({
        token: "tok-abc",
        port: 4321,
        host: "127.0.0.1",
      });
    }
  });

  it("accepts localhost and [::1] navigation hosts", () => {
    const localhost = synthesizePairingUrlFromHttpPairPage(
      "http://localhost:4321/pair?token=a&port=4321&host=localhost",
    );
    expect(localhost.success).toBe(true);

    const ipv6 = synthesizePairingUrlFromHttpPairPage(
      "http://[::1]:4321/pair?token=a&port=4321&host=::1",
    );
    expect(ipv6.success).toBe(true);
  });

  it("round-trips build → synthesize → parsePairingUrl", () => {
    const built = buildPairingHttpUrl({
      token: "round-trip/token+1",
      port: 5555,
      host: "127.0.0.1",
    });
    expect(built.success).toBe(true);
    if (!built.success) {
      return;
    }
    const synthesized = synthesizePairingUrlFromHttpPairPage(built.url);
    expect(synthesized.success).toBe(true);
    if (!synthesized.success) {
      return;
    }
    const parsed = parsePairingUrl(synthesized.pairingUrl);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.target.token).toBe("round-trip/token+1");
      expect(parsed.target.port).toBe(5555);
      expect(parsed.target.host).toBe("127.0.0.1");
    }
  });

  it("fails on non-loopback hosts", () => {
    const result = synthesizePairingUrlFromHttpPairPage(
      "http://evil.com/pair?token=tok&port=4321&host=evil.com",
    );
    expect(result.success).toBe(false);
  });

  it("fails on wrong path", () => {
    const result = synthesizePairingUrlFromHttpPairPage(
      "http://127.0.0.1:4321/other?token=tok&port=4321&host=127.0.0.1",
    );
    expect(result.success).toBe(false);
  });

  it("fails when token is missing", () => {
    const result = synthesizePairingUrlFromHttpPairPage(
      "http://127.0.0.1:4321/pair?port=4321&host=127.0.0.1",
    );
    expect(result.success).toBe(false);
  });
});

describe("computeBackoffDelay", () => {
  it("starts at the initial delay (with deterministic jitter)", () => {
    const delay = computeBackoffDelay(0, {
      initialMs: 1000,
      maxMs: 30_000,
      jitter: 0,
      random: () => 0,
    });
    expect(delay).toBe(1000);
  });

  it("doubles each attempt up to the cap", () => {
    const opts = { initialMs: 1000, maxMs: 30_000, jitter: 0, random: () => 0 };
    expect(computeBackoffDelay(0, opts)).toBe(1000);
    expect(computeBackoffDelay(1, opts)).toBe(2000);
    expect(computeBackoffDelay(2, opts)).toBe(4000);
    expect(computeBackoffDelay(5, opts)).toBe(30_000);
  });

  it("applies jitter within the ±20% band", () => {
    const base = computeBackoffDelay(0, { initialMs: 1000, jitter: 0.2, random: () => 0 });
    expect(base).toBeGreaterThanOrEqual(800);
    expect(base).toBeLessThanOrEqual(1200);
  });
});

/** Drives DaemonClient through the handshake + reconnect without the network. */
class FakeWebSocket implements WebSocketLike {
  readonly OPEN = 1;
  readyState = 1;
  onopen: ((this: WebSocketLike) => void) | null = null;
  onmessage: ((this: WebSocketLike, ev: { readonly data: string }) => void) | null = null;
  onclose:
    | ((this: WebSocketLike, ev: { readonly code?: number; readonly reason?: string }) => void)
    | null = null;
  onerror: ((this: WebSocketLike) => void) | null = null;
  readonly sent: string[] = [];

  emitOpen(): void {
    this.onopen?.call(this);
  }
  emitMessage(data: string): void {
    this.onmessage?.call(this, { data });
  }
  emitClose(code?: number): void {
    this.readyState = 3;
    this.onclose?.call(this, code !== undefined ? { code } : {});
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
}

describe("DaemonClient handshake + reconnect", () => {
  it("completes the hello/welcome handshake", async () => {
    const fake = new FakeWebSocket();
    const timers: Array<() => void> = [];
    const client = new DaemonClient({
      target: TARGET,
      factory: () => fake,
      uuid: () => "client-msg-0001",
      setTimeout: (fn) => {
        timers.push(fn);
        return 0 as never;
      },
      clearTimeout: () => {},
    });

    const handshake = client.connect();
    fake.emitOpen();
    const hello = JSON.parse(fake.sent[0] ?? "{}");
    expect(hello.payload.type).toBe("hello");
    const welcome = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: "server-welcome-01",
      messageType: "welcome",
      payload: {
        type: "welcome",
        serverVersion: PROTOCOL_VERSION,
        serverCapabilities: ["selection"],
        sessionId: "sess-aaa",
        sessionToken: "st-xyz",
      },
      timestamp: 1,
    };
    fake.emitMessage(JSON.stringify(welcome));

    const result = await handshake;
    expect(result.sessionId).toBe("sess-aaa");
    expect(client.state).toBe("connected");
  });

  it("schedules a reconnect with backoff when the socket closes", async () => {
    const fake = new FakeWebSocket();
    const scheduled: number[] = [];
    let delayCapture = 0;
    const client = new DaemonClient({
      target: TARGET,
      factory: () => fake,
      uuid: () => "client-msg-0002",
      setTimeout: (_fn, ms) => {
        scheduled.push(ms);
        delayCapture = ms;
        return 0 as never;
      },
      clearTimeout: () => {},
    });

    const handshake = client.connect();
    fake.emitOpen();
    fake.emitMessage(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "welcome-msg-0001",
        messageType: "welcome",
        payload: {
          type: "welcome",
          serverVersion: PROTOCOL_VERSION,
          serverCapabilities: [],
          sessionId: "sess-bbb",
          sessionToken: "st",
        },
        timestamp: 1,
      }),
    );
    await handshake;
    expect(client.state).toBe("connected");

    fake.emitClose(1006);
    expect(client.state).toBe("reconnecting");
    expect(scheduled).toHaveLength(1);
    expect(delayCapture).toBeGreaterThanOrEqual(800);
    expect(delayCapture).toBeLessThanOrEqual(1200);

    client.disconnect();
    expect(client.state).toBe("disconnected");
  });
});
