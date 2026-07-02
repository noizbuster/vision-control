import { describe, expect, it } from "vitest";
import { ConsoleLogger, type LogEntry, NoopLogger, RedactingLogger } from "./index.js";

const parseLines = (lines: string[]): LogEntry[] =>
  lines.map((line) => JSON.parse(line) as LogEntry);

const firstEntry = (lines: string[]): LogEntry => {
  const entry = parseLines(lines)[0];
  if (entry === undefined) {
    throw new Error("expected at least one log line");
  }
  return entry;
};

describe("ConsoleLogger", () => {
  it("emits one structured JSON line per entry with level, message, and timestamp", () => {
    const lines: string[] = [];
    const logger = new ConsoleLogger({ now: () => 42, sink: (line) => lines.push(line) });
    logger.info("hello", { component: "daemon" });
    const entry = firstEntry(lines);
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("hello");
    expect(entry.timestamp).toBe(42);
    expect(entry.fields).toEqual({ component: "daemon" });
  });

  it("propagates a correlationId through child() and a sessionId through withSession()", () => {
    const lines: string[] = [];
    const logger = new ConsoleLogger({ now: () => 1, sink: (line) => lines.push(line) });
    const child = logger.child("corr-123").withSession("sess-456");
    child.warn("checkpoint");
    const entry = firstEntry(lines);
    expect(entry.correlationId).toBe("corr-123");
    expect(entry.sessionId).toBe("sess-456");
    expect(entry.level).toBe("warn");
  });

  it("generates a correlationId when child() is called without one", () => {
    const lines: string[] = [];
    const logger = new ConsoleLogger({ now: () => 1, sink: (line) => lines.push(line) });
    const child = logger.child();
    child.info("auto-id");
    const entry = firstEntry(lines);
    expect(entry.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("omits correlationId/sessionId when unset (exactOptionality)", () => {
    const lines: string[] = [];
    const logger = new ConsoleLogger({ now: () => 1, sink: (line) => lines.push(line) });
    logger.error("bare");
    const entry = firstEntry(lines);
    expect(entry).not.toHaveProperty("correlationId");
    expect(entry).not.toHaveProperty("sessionId");
  });
});

describe("NoopLogger", () => {
  it("discards everything", () => {
    const logger = new NoopLogger();
    expect(() => logger.info("x", { a: 1 })).not.toThrow();
    expect(logger.child()).toBeInstanceOf(NoopLogger);
  });
});

describe("RedactingLogger", () => {
  it("NEGATIVE: strips seeded secrets from fields and message before they reach the sink", () => {
    const lines: string[] = [];
    const inner = new ConsoleLogger({ now: () => 0, sink: (line) => lines.push(line) });
    const logger = new RedactingLogger(inner);

    logger.info("auth api_key=sk_test_12345 password=VC_SECRET_SHOULD_NOT_EXPORT", {
      password: "VC_SECRET_SHOULD_NOT_EXPORT",
      cookie: "session=abc123",
      api_key: "sk_test_12345",
      safe: "keep-me",
    });

    const blob = lines.join("\n");
    expect(blob).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(blob).not.toContain("session=abc123");
    expect(blob).not.toContain("sk_test_12345");
    expect(blob).toContain("keep-me");
    expect(blob).toContain("[REDACTED:");
  });

  it("preserves correlationId propagation through child()", () => {
    const lines: string[] = [];
    const inner = new ConsoleLogger({ now: () => 1, sink: (line) => lines.push(line) });
    const logger = new RedactingLogger(inner).child("corr-1");
    logger.info("m", { token: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" });
    const entry = firstEntry(lines);
    expect(entry.correlationId).toBe("corr-1");
    expect(JSON.stringify(entry.fields)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz1234567890");
  });
});
