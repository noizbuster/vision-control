import type { IncomingMessage } from "node:http";
import type { ProtocolErrorCode } from "@vision-control/protocol";
import { isOriginAllowed, type OriginAllowlistConfig } from "@vision-control/security";
import type { SessionRow } from "@vision-control/storage";
import type { SessionService } from "./services/session-service.js";

/** The auth decision returned for a WebSocket upgrade request. */
export type AuthDecision =
  | { readonly ok: true; readonly session: SessionRow }
  | {
      readonly ok: false;
      readonly code: ProtocolErrorCode;
      readonly status: number;
      readonly reason: string;
    };

/**
 * Authenticate an incoming WebSocket upgrade request.
 *
 * Two checks, in order:
 * 1. **Origin allowlist** — the `Origin` header must satisfy
 *    {@link isOriginAllowed}. Failure → `ORIGIN_NOT_ALLOWED` (403).
 * 2. **Pairing token** — a `token` query parameter must be present and validate
 *    against a stored session hash (non-expired). Failure → `UNAUTHORIZED` (401).
 *
 * This is the single enforcement point for both CSRF-origin protection and
 * unauthenticated-connection rejection (PRD §27.1).
 */
export async function authenticateUpgrade(
  req: IncomingMessage,
  sessionService: SessionService,
  originConfig: OriginAllowlistConfig,
): Promise<AuthDecision> {
  const origin = req.headers.origin ?? "";
  if (!isOriginAllowed(origin, originConfig)) {
    return {
      ok: false,
      code: "ORIGIN_NOT_ALLOWED",
      status: 403,
      reason: `origin "${origin}" is not allowed`,
    };
  }

  const rawToken = extractTokenFromUrl(req.url ?? "");
  if (rawToken === undefined) {
    return { ok: false, code: "UNAUTHORIZED", status: 401, reason: "missing token" };
  }

  const result = await sessionService.validatePairingToken(rawToken);
  if (!result.ok) {
    return { ok: false, code: "UNAUTHORIZED", status: 401, reason: result.reason };
  }
  return { ok: true, session: result.session };
}

/** Extract the `token` query parameter from a request URL. Returns `undefined` when absent. */
export function extractTokenFromUrl(url: string): string | undefined {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) {
    return undefined;
  }
  const query = url.slice(queryIndex + 1);
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = pair.slice(0, eq);
    if (key === "token") {
      const value = pair.slice(eq + 1);
      return value.length === 0 ? undefined : decodeURIComponent(value);
    }
  }
  return undefined;
}
