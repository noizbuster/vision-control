import { z } from "zod";

import { type ParseResult, protocolError } from "./errors.js";
import {
  hasCompatibleMajor,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PATTERN,
  parseProtocolVersion,
} from "./version.js";

/**
 * Matches cuid2, nanoid, and UUID identifiers: URL-safe alphanumeric plus
 * underscore/hyphen, 8-128 characters.
 */
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export const ProtocolEnvelopeSchema = z.object({
  protocolVersion: z.string().regex(PROTOCOL_VERSION_PATTERN),
  messageId: z.string().regex(MESSAGE_ID_PATTERN),
  messageType: z.string().min(1),
  correlationId: z.string().optional(),
  sessionId: z.string().optional(),
  tabId: z.string().optional(),
  frameId: z.string().optional(),
  payload: z.unknown(),
  timestamp: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ProtocolEnvelope = z.infer<typeof ProtocolEnvelopeSchema>;

// PROTOCOL_VERSION is a controlled constant, so this always succeeds. Parsing
// once at module load avoids repeating the work on every parseEnvelope call.
const LIBRARY_VERSION = (() => {
  const result = parseProtocolVersion(PROTOCOL_VERSION);
  if (result.success) return result.data;
  throw new Error(`Invalid PROTOCOL_VERSION constant: "${PROTOCOL_VERSION}"`);
})();

/**
 * Parse and validate a raw envelope value. Never throws: returns a
 * {@link ParseResult}. Structure failures map to `INVALID_PAYLOAD`; a major
 * version mismatch (envelope MAJOR != library MAJOR) maps to
 * `PROTOCOL_VERSION_MISMATCH`.
 */
export const parseEnvelope = (input: unknown): ParseResult<ProtocolEnvelope> => {
  const result = ProtocolEnvelopeSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      error: protocolError("INVALID_PAYLOAD", { issues: result.error.issues }),
    };
  }
  const envelope = result.data;
  const parsedVersion = parseProtocolVersion(envelope.protocolVersion);
  // protocolVersion is regex-validated by the schema, so this always succeeds.
  if (!parsedVersion.success || !hasCompatibleMajor(parsedVersion.data, LIBRARY_VERSION)) {
    return {
      success: false,
      error: protocolError("PROTOCOL_VERSION_MISMATCH", {
        envelope: envelope.protocolVersion,
        library: PROTOCOL_VERSION,
      }),
    };
  }
  return { success: true, data: envelope };
};
