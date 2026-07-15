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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/** Always used as the HTTP navigation host when building an openable pair URL. */
export const PAIRING_HTTP_NAVIGATION_HOST = "127.0.0.1";

export const PairingTargetSchema = z.object({
  token: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
});

export type PairingTarget = z.infer<typeof PairingTargetSchema>;

export type PairingParseResult =
  | { readonly success: true; readonly target: PairingTarget }
  | { readonly success: false; readonly reason: string };

export type BuildPairingHttpUrlInput = {
  readonly token: string;
  readonly port: number;
  readonly host: string;
};

export type BuildPairingHttpUrlResult =
  | { readonly success: true; readonly url: string }
  | { readonly success: false; readonly reason: string };

export type SynthesizePairingUrlResult =
  | { readonly success: true; readonly pairingUrl: string }
  | { readonly success: false; readonly reason: string };

const normalizeHostname = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

const isLoopbackHost = (host: string): boolean => LOOPBACK_HOSTS.has(normalizeHostname(host));

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

/**
 * Build a loopback HTTP pair-page URL for browser auto-open.
 *
 * Navigation always uses {@link PAIRING_HTTP_NAVIGATION_HOST} (`127.0.0.1`).
 * The bind `host` is carried in the query for display / synthesis only.
 * Non-loopback hosts are refused so the open URL never leaves loopback.
 */
export const buildPairingHttpUrl = (
  input: BuildPairingHttpUrlInput,
): BuildPairingHttpUrlResult => {
  if (typeof input.token !== "string" || input.token.length === 0) {
    return { success: false, reason: "missing or empty token" };
  }
  if (
    typeof input.port !== "number" ||
    !Number.isInteger(input.port) ||
    input.port <= 0 ||
    input.port > 65535
  ) {
    return { success: false, reason: `invalid port "${String(input.port)}"` };
  }
  if (typeof input.host !== "string" || input.host.length === 0) {
    return { success: false, reason: "missing host" };
  }
  if (!isLoopbackHost(input.host)) {
    return {
      success: false,
      reason: `host "${input.host}" is not loopback; refusing HTTP pair open URL`,
    };
  }

  const params = new URLSearchParams({
    token: input.token,
    port: String(input.port),
    host: input.host,
  });
  return {
    success: true,
    url: `http://${PAIRING_HTTP_NAVIGATION_HOST}:${input.port}${PAIRING_PAIR_PATH}?${params.toString()}`,
  };
};

/**
 * Synthesize a `vision-control://pair?...` URL from a loopback HTTP(S) pair page.
 *
 * Does not broaden {@link parsePairingUrl}: only this helper accepts `http:` /
 * `https:` and only for loopback hosts with path `/pair`.
 */
export const synthesizePairingUrlFromHttpPairPage = (
  input: string,
): SynthesizePairingUrlResult => {
  if (typeof input !== "string" || input.length === 0) {
    return { success: false, reason: "empty pair page URL" };
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { success: false, reason: "not a valid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      success: false,
      reason: `unsupported scheme "${parsed.protocol}" (expected http: or https:)`,
    };
  }
  if (!isLoopbackHost(parsed.hostname)) {
    return {
      success: false,
      reason: `host "${parsed.hostname}" is not loopback`,
    };
  }
  if (parsed.pathname !== PAIRING_PAIR_PATH) {
    return {
      success: false,
      reason: `path "${parsed.pathname}" is not ${PAIRING_PAIR_PATH}`,
    };
  }

  const token = parsed.searchParams.get("token");
  const portParam = parsed.searchParams.get("port");
  const hostParam = parsed.searchParams.get("host") ?? normalizeHostname(parsed.hostname);

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
  if (!isLoopbackHost(hostParam)) {
    return {
      success: false,
      reason: `query host "${hostParam}" is not loopback`,
    };
  }

  const params = new URLSearchParams({
    token,
    port: String(port),
    host: hostParam,
  });
  return {
    success: true,
    pairingUrl: `${PAIRING_PROTOCOL}//pair?${params.toString()}`,
  };
};
