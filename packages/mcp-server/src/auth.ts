/**
 * Authentication middleware for the HTTP MCP transport.
 *
 * Validates the session token (from the `Authorization: Bearer <token>` header)
 * and checks the request origin against the allowlist. Unauthenticated requests
 * are rejected before any MCP processing — the transport never sees them, so no
 * context is leaked (PRD section 27.1, docs/agents/security-privacy.md).
 *
 * Uses `@vision-control/security` for the origin allowlist and constant-time
 * token comparison to prevent timing attacks.
 */

import type { IncomingMessage } from "node:http";
import {
  defaultAllowlistConfig,
  isOriginAllowed,
  type OriginAllowlistConfig,
} from "@vision-control/security";

export interface AuthConfig {
  /** Expected bearer token. Requests without a matching token are rejected. */
  readonly token: string;
  /** Origin allowlist. Defaults to loopback + chrome-extension origins. */
  readonly originAllowlist?: OriginAllowlistConfig;
}

export type AuthResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly reason: string; readonly status: number };

/**
 * Constant-time string comparison to prevent timing side-channels on token
 * validation. Returns true only when both strings are equal.
 */
const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

/**
 * Validate a single HTTP request against {@link AuthConfig}.
 *
 * Checks in order: origin allowlist (403 on failure), then bearer token
 * (401 on failure). Never throws — returns a structured result the caller
 * uses to decide whether to proceed.
 */
export function checkAuth(req: IncomingMessage, config: AuthConfig): AuthResult {
  const allowlist = config.originAllowlist ?? defaultAllowlistConfig();
  const origin = req.headers.origin ?? "";
  if (origin.length > 0 && !isOriginAllowed(origin, allowlist)) {
    return {
      ok: false,
      code: "ORIGIN_NOT_ALLOWED",
      reason: `origin "${origin}" is not on the allowlist`,
      status: 403,
    };
  }

  const authHeader = req.headers.authorization;
  if (authHeader === undefined) {
    return { ok: false, code: "UNAUTHORIZED", reason: "missing Authorization header", status: 401 };
  }
  const token = extractBearerToken(authHeader);
  if (token === undefined) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      reason: "invalid Authorization header format",
      status: 401,
    };
  }
  if (!constantTimeEquals(token, config.token)) {
    return { ok: false, code: "UNAUTHORIZED", reason: "invalid session token", status: 401 };
  }
  return { ok: true };
}

/**
 * Extract the bearer token from an `Authorization` header value.
 * Returns undefined for malformed headers.
 */
const extractBearerToken = (header: string): string | undefined => {
  const parts = header.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return undefined;
  }
  const token = parts[1];
  return token !== undefined && token.length > 0 ? token : undefined;
};
