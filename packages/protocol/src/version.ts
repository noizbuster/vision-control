/**
 * Protocol version constant and compatibility logic.
 *
 * Versioning rule (semver):
 * - Different MAJOR is incompatible (breaking schema change requires major bump).
 * - Same MAJOR, server MINOR >= client MINOR is compatible (server is at least as
 *   new as the client, so it understands everything the client sends).
 * - Same MAJOR, server MINOR < client MINOR is reported as incompatible by the
 *   strict negotiation check, even though additive fields keep parsing working.
 * - PATCH differences are always compatible (bug fixes only).
 *
 * Additive-field compatibility (forward compat): unknown extra fields in message
 * payloads and envelope metadata are ignored by the parser, so a newer client
 * can talk to an older server without breaking the wire.
 */

/**
 * Current protocol version.
 *
 * 2.0.0 (major, breaking) — replaces the generic `page-event`/`session-event`
 * collapse with the 15-message §25 typed catalog (8 browser→daemon + 7
 * daemon→browser). The handshake backbone (`hello`/`welcome`/`error`/`ack`/
 * `nack`) is unchanged. Per PRD §25.3, a major bump is required because the
 * message-type discriminator set changed (old `page-event`/`session-event` are
 * removed; 15 new dotted literals are added).
 *
 * Compatibility: {@link hasCompatibleMajor} now accepts any 2.x envelope.
 * {@link isCompatible} requires same MAJOR and `server.minor >= client.minor`.
 * A 2.0.0 client ↔ 1.x daemon (or vice versa) is rejected with
 * `PROTOCOL_VERSION_MISMATCH`.
 */
export const PROTOCOL_VERSION = "2.0.0";

export const PROTOCOL_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export type VersionParseResult =
  | { readonly success: true; readonly data: ParsedVersion }
  | { readonly success: false; readonly error: string };

export const parseProtocolVersion = (version: string): VersionParseResult => {
  const match = PROTOCOL_VERSION_PATTERN.exec(version);
  if (!match) {
    return { success: false, error: `invalid semver version: "${version}"` };
  }
  return {
    success: true,
    data: {
      major: Number.parseInt(match[1] ?? "0", 10),
      minor: Number.parseInt(match[2] ?? "0", 10),
      patch: Number.parseInt(match[3] ?? "0", 10),
    },
  };
};

/**
 * Strict version compatibility for negotiation: same MAJOR and the server is at
 * least as new as the client (server.minor >= client.minor). PATCH is always
 * compatible within the same MAJOR.
 */
export const isCompatible = (client: ParsedVersion, server: ParsedVersion): boolean => {
  if (client.major !== server.major) return false;
  return server.minor >= client.minor;
};

/**
 * Major-version-only check used when parsing a received envelope. Within the
 * same MAJOR, additive fields keep the wire compatible, so the parser accepts
 * any same-major envelope regardless of minor/patch differences.
 */
export const hasCompatibleMajor = (a: ParsedVersion, b: ParsedVersion): boolean =>
  a.major === b.major;
