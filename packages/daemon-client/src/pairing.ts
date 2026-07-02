import { z } from "zod";

/**
 * Pairing URL parsing for the Vision Control daemon.
 *
 * The daemon prints a one-time pairing URL of the form:
 *   `vision-control://pair?token=<TOKEN>&port=<PORT>&host=<HOST>`
 *
 * This module parses that URL into a typed {@link PairingTarget} that the
 * {@link DaemonClient} turns into a `ws://` (or `wss://`) WebSocket URL.
 * Parsing never throws: an unparseable URL returns `{ success: false }`.
 */

export const PAIRING_PROTOCOL = "vision-control:";
export const PAIRING_PAIR_PATH = "/pair";

export const PairingTargetSchema = z.object({
  token: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
});

export type PairingTarget = z.infer<typeof PairingTargetSchema>;

export type PairingParseResult =
  | { readonly success: true; readonly target: PairingTarget }
  | { readonly success: false; readonly reason: string };

/**
 * Parse a `vision-control://pair?...` URL. Accepts the custom scheme and
 * extracts `token`, `host` (default `127.0.0.1`), and `port`. Returns a parse
 * result rather than throwing so callers handle bad input explicitly.
 */
export const parsePairingUrl = (input: string): PairingParseResult => {
  if (typeof input !== "string" || input.length === 0) {
    return { success: false, reason: "empty pairing URL" };
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { success: false, reason: "not a valid URL" };
  }
  if (parsed.protocol !== PAIRING_PROTOCOL) {
    return {
      success: false,
      reason: `unsupported scheme "${parsed.protocol}" (expected "${PAIRING_PROTOCOL}")`,
    };
  }

  const token = parsed.searchParams.get("token");
  const portParam = parsed.searchParams.get("port");
  const hostParam = parsed.searchParams.get("host") ?? parsed.hostname;

  if (token === null || token.length === 0) {
    return { success: false, reason: "missing or empty token query parameter" };
  }
  if (portParam === null) {
    return { success: false, reason: "missing port query parameter" };
  }
  const port = Number.parseInt(portParam, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    return { success: false, reason: `invalid port "${portParam}"` };
  }
  if (hostParam.length === 0) {
    return { success: false, reason: "missing host" };
  }

  const result = PairingTargetSchema.safeParse({ token, host: hostParam, port });
  if (!result.success) {
    return { success: false, reason: "validation failed" };
  }
  return { success: true, target: result.data };
};

/** Build the `ws://` URL the client connects to from a parsed pairing target. */
export const toWebSocketUrl = (target: PairingTarget, secure = false): string =>
  `${secure ? "wss" : "ws"}://${target.host}:${target.port}/?token=${encodeURIComponent(target.token)}`;
