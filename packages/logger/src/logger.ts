/**
 * Structured logging interface and reference implementations.
 *
 * Every log entry is a structured record (never a free-form string) carrying a
 * level, message, timestamp, optional correlation/session ids, and a `fields`
 * bag. Correlation ids propagate across a request via {@link Logger.child}.
 *
 * The {@link RedactingLogger} wrapper (see `redacting-logger.ts`) sits in front
 * of any logger and masks secret-shaped values in `fields`/`message` before they
 * reach the inner sink — the last line of defense against secret leakage into
 * logs (ADR-009).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** A single structured log entry. */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: number;
  readonly correlationId?: string;
  readonly sessionId?: string;
  readonly fields: Record<string, unknown>;
}

/** Correlation/session ids bound to a logger, threaded through to every entry. */
interface BoundContext {
  readonly correlationId: string | undefined;
  readonly sessionId: string | undefined;
}

/** Injectable dependencies for constructing loggers (clock + sink). */
export interface LoggerOptions {
  readonly now?: () => number;
  readonly sink?: (line: string) => void;
  readonly correlationId?: string;
  readonly sessionId?: string;
}

/** The logger contract every Vision Control component programs against. */
export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void;
  /** Return a new logger with `correlationId` bound (generated if omitted). */
  child(correlationId?: string): Logger;
  /** Return a new logger with `sessionId` bound. */
  withSession(sessionId: string): Logger;
}

const defaultNow = (): number => Date.now();

const writeEntry = (
  bound: BoundContext,
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> | undefined,
  now: () => number,
  sink: (line: string) => void,
): void => {
  const entry: LogEntry = {
    level,
    message,
    timestamp: now(),
    fields: fields ?? {},
    ...(bound.correlationId !== undefined ? { correlationId: bound.correlationId } : {}),
    ...(bound.sessionId !== undefined ? { sessionId: bound.sessionId } : {}),
  };
  sink(JSON.stringify(entry));
};

/** Node console logger: one JSON object per line. */
export class ConsoleLogger implements Logger {
  private readonly now: () => number;
  private readonly sink: (line: string) => void;
  private readonly correlationId: string | undefined;
  private readonly sessionId: string | undefined;

  constructor(options: LoggerOptions = {}) {
    this.now = options.now ?? defaultNow;
    this.sink = options.sink ?? ((line) => console.log(line));
    this.correlationId = options.correlationId;
    this.sessionId = options.sessionId;
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.log("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.log("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.log("warn", message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.log("error", message, fields);
  }

  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    writeEntry(
      { correlationId: this.correlationId, sessionId: this.sessionId },
      level,
      message,
      fields,
      this.now,
      this.sink,
    );
  }

  child(correlationId?: string): Logger {
    const next = correlationId ?? globalThis.crypto.randomUUID();
    return new ConsoleLogger({
      now: this.now,
      sink: this.sink,
      correlationId: next,
      ...(this.sessionId !== undefined ? { sessionId: this.sessionId } : {}),
    });
  }

  withSession(sessionId: string): Logger {
    return new ConsoleLogger({
      now: this.now,
      sink: this.sink,
      sessionId,
      ...(this.correlationId !== undefined ? { correlationId: this.correlationId } : {}),
    });
  }
}

/** Discards every entry. Use in tests that need a Logger but assert nothing. */
export class NoopLogger implements Logger {
  debug(_message: string, _fields?: Record<string, unknown>): void {}
  info(_message: string, _fields?: Record<string, unknown>): void {}
  warn(_message: string, _fields?: Record<string, unknown>): void {}
  error(_message: string, _fields?: Record<string, unknown>): void {}
  log(_level: LogLevel, _message: string, _fields?: Record<string, unknown>): void {}

  child(): Logger {
    return new NoopLogger();
  }

  withSession(_sessionId: string): Logger {
    return new NoopLogger();
  }
}
