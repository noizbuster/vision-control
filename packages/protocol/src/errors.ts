import { z } from "zod";

/**
 * Error taxonomy for the Vision Control protocol.
 *
 * Each code maps to a default HTTP-ish status and a human-readable message.
 * Build errors with {@link protocolError}; never construct the object literal
 * directly so the status/message pairing stays centralized here.
 */

export const ProtocolErrorCodeSchema = z.enum([
  "PROTOCOL_VERSION_MISMATCH",
  "UNKNOWN_MESSAGE_TYPE",
  "INVALID_PAYLOAD",
  "MISSING_FIELD",
  "UNAUTHORIZED",
  "ORIGIN_NOT_ALLOWED",
  "SESSION_NOT_FOUND",
  "FRAME_NOT_FOUND",
  "WORKSPACE_NOT_BOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "VERIFICATION_FAILED",
]);

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;

interface ErrorMeta {
  readonly status: number;
  readonly message: string;
}

const ERROR_META: Record<ProtocolErrorCode, ErrorMeta> = {
  PROTOCOL_VERSION_MISMATCH: {
    status: 426,
    message: "Protocol version is incompatible.",
  },
  UNKNOWN_MESSAGE_TYPE: {
    status: 400,
    message: "Unknown message type.",
  },
  INVALID_PAYLOAD: {
    status: 400,
    message: "Message payload failed validation.",
  },
  MISSING_FIELD: {
    status: 400,
    message: "A required field is missing.",
  },
  UNAUTHORIZED: {
    status: 401,
    message: "Authentication is required or has failed.",
  },
  ORIGIN_NOT_ALLOWED: {
    status: 403,
    message: "Origin is not allowed to access this resource.",
  },
  SESSION_NOT_FOUND: {
    status: 404,
    message: "Session was not found.",
  },
  FRAME_NOT_FOUND: {
    status: 404,
    message: "Frame was not found.",
  },
  WORKSPACE_NOT_BOUND: {
    status: 412,
    message: "No workspace is bound to this session.",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests.",
  },
  INTERNAL_ERROR: {
    status: 500,
    message: "An internal error occurred.",
  },
  VERIFICATION_FAILED: {
    status: 422,
    message: "Source verification failed.",
  },
};

export const ProtocolErrorSchema = z.object({
  code: ProtocolErrorCodeSchema,
  message: z.string(),
  status: z.number().int().nonnegative(),
  details: z.unknown().optional(),
});

export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;

/**
 * A parse-result discriminated union. Every protocol parser returns this shape
 * instead of throwing, so error handling is explicit at every boundary.
 */
export type ParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ProtocolError };

/**
 * Build a typed {@link ProtocolError} from a known code, attaching optional
 * `details` for machine-readable context. The `message` and `status` come from
 * the taxonomy; callers only supply the code and optional context.
 */
export const protocolError = (code: ProtocolErrorCode, details?: unknown): ProtocolError => {
  const meta = ERROR_META[code];
  return details === undefined
    ? { code, message: meta.message, status: meta.status }
    : { code, message: meta.message, status: meta.status, details };
};
