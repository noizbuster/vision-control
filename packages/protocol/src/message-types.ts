import { z } from "zod";

import { bridgeLifecycleSchemas, bridgeSchemas } from "./catalog/bridge.js";
import { browserToDaemonSchemas } from "./catalog/browser-to-daemon.js";
import { daemonToBrowserSchemas } from "./catalog/daemon-to-browser.js";
import { type ParseResult, ProtocolErrorCodeSchema, protocolError } from "./errors.js";

/**
 * Discriminated union of all known message types (PRD §25 catalog + handshake
 * backbone + ADR-020 bridge).
 *
 * The union has three tiers:
 * 1. **Handshake backbone** — `hello`, `welcome`, `error`, `ack`, `nack`.
 *    These handle transport-level session establishment and acknowledgement.
 * 2. **§25 business catalog** — 15 typed messages (8 browser→daemon per §25.1,
 *    7 daemon→browser per §25.2) that flow after the handshake completes.
 * 3. **ADR-020 bridge catalog** — snapshot, tab lifecycle, command, and
 *    verification projection messages (heartbeat reuses `session.heartbeat`).
 *
 * Each variant is keyed by its `type` literal. The envelope carries the message
 * in its `payload` field; callers narrow via {@link parseMessage}.
 *
 * To add a new variant:
 *   1. Define a schema in the appropriate `catalog/*.ts` file.
 *   2. Add it to the exported `*Schemas` array.
 *   3. It is automatically included in {@link MessageSchema} below.
 */

// ── Handshake backbone ──────────────────────────────────────────────────────

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

// ── Full discriminated union ────────────────────────────────────────────────

export const MessageSchema = z.discriminatedUnion("type", [
  HelloMessageSchema,
  WelcomeMessageSchema,
  ErrorMessageSchema,
  AckMessageSchema,
  NackMessageSchema,
  ...browserToDaemonSchemas,
  ...daemonToBrowserSchemas,
  ...bridgeSchemas,
  ...bridgeLifecycleSchemas,
]);

// ── Type re-exports ─────────────────────────────────────────────────────────

export type AckMessage = z.infer<typeof AckMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type HelloMessage = z.infer<typeof HelloMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type NackMessage = z.infer<typeof NackMessageSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;

// ── Parser ──────────────────────────────────────────────────────────────────

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
