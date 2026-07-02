import { z } from "zod";

import { type ParseResult, ProtocolErrorCodeSchema, protocolError } from "./errors.js";

/**
 * Discriminated union of known MVP message types.
 *
 * Each variant is keyed by its `type` literal. The envelope carries the message
 * in its `payload` field (typed `unknown`); callers narrow via
 * {@link parseMessage}.
 *
 * To add a new variant:
 *   1. Define `<Name>MessageSchema` with a unique `z.literal("<type>")`.
 *   2. Append it to the `MessageSchema` discriminated-union array below.
 *   3. Export the inferred type.
 * The union is open to extension; do not add V1-only types (multi-select,
 * auto-layout, etc.) per the MVP scope.
 */

export const HelloMessageSchema = z.object({
  type: z.literal("hello"),
  clientVersion: z.string(),
  clientCapabilities: z.array(z.string()),
});

export const WelcomeMessageSchema = z.object({
  type: z.literal("welcome"),
  serverVersion: z.string(),
  serverCapabilities: z.array(z.string()),
  sessionId: z.string(),
  sessionToken: z.string(),
});

export const PageEventMessageSchema = z.object({
  type: z.literal("page-event"),
  event: z.enum(["load", "reload", "navigation", "tab-focus", "devtools-open", "devtools-close"]),
  url: z.string(),
  title: z.string(),
  framePath: z.array(z.string()),
});

export const SessionEventMessageSchema = z.object({
  type: z.literal("session-event"),
  payload: z.unknown(),
});

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  code: ProtocolErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

export const AckMessageSchema = z.object({
  type: z.literal("ack"),
  messageId: z.string(),
});

export const NackMessageSchema = z.object({
  type: z.literal("nack"),
  messageId: z.string(),
  reason: z.string().optional(),
});

export const MessageSchema = z.discriminatedUnion("type", [
  HelloMessageSchema,
  WelcomeMessageSchema,
  PageEventMessageSchema,
  SessionEventMessageSchema,
  ErrorMessageSchema,
  AckMessageSchema,
  NackMessageSchema,
]);

export type AckMessage = z.infer<typeof AckMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type NackMessage = z.infer<typeof NackMessageSchema>;
export type PageEventMessage = z.infer<typeof PageEventMessageSchema>;
export type SessionEventMessage = z.infer<typeof SessionEventMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;

/**
 * Parse an unknown payload into a typed {@link Message}. Returns a
 * {@link ParseResult}; never throws. Any failure to match the discriminated
 * union (including genuinely unknown `type` literals) maps to
 * `UNKNOWN_MESSAGE_TYPE`.
 */
export const parseMessage = (input: unknown): ParseResult<Message> => {
  const result = MessageSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: protocolError("UNKNOWN_MESSAGE_TYPE", { issues: result.error.issues }),
  };
};
