/**
 * Redacting logger — the last line of defense against secret leakage into logs.
 *
 * Wraps any {@link Logger} and applies `@vision-control/security` redaction to
 * the `fields` bag (deep) and the `message` string before delegating to the
 * inner logger. This guarantees that secrets, cookies, auth headers, and
 * password values never reach a browser-visible channel or on-disk log,
 * regardless of what a caller passes in. See ADR-009.
 */

import { type RedactionPattern, redactObject, redactString } from "@vision-control/security";
import type { Logger, LogLevel } from "./logger.js";

export interface RedactingLoggerOptions {
  /** Custom redaction patterns; defaults to the security package defaults. */
  readonly patterns?: readonly RedactionPattern[];
}

export class RedactingLogger implements Logger {
  constructor(
    private readonly inner: Logger,
    private readonly options: RedactingLoggerOptions = {},
  ) {}

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
    const patterns = this.options.patterns;
    const safeMessage =
      patterns === undefined ? redactString(message) : redactString(message, patterns);
    const safeFields =
      patterns === undefined
        ? (redactObject(fields ?? {}) as Record<string, unknown>)
        : (redactObject(fields ?? {}, patterns) as Record<string, unknown>);
    this.inner.log(level, safeMessage, safeFields);
  }

  /** Returns a redacting wrapper around the inner logger's child. */
  child(correlationId?: string): Logger {
    return new RedactingLogger(this.inner.child(correlationId), this.options);
  }

  /** Returns a redacting wrapper around the inner logger's session-scoped view. */
  withSession(sessionId: string): Logger {
    return new RedactingLogger(this.inner.withSession(sessionId), this.options);
  }
}
