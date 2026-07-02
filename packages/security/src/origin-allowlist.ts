/**
 * Origin allowlist for the loopback daemon.
 *
 * The daemon accepts requests only from origins it has been told to trust. The
 * default policy (see `docs/agents/security-privacy.md` and PRD §27.1) is:
 * loopback only (`127.0.0.1`, `::1`, `localhost`) plus the extension's own
 * origin (`chrome-extension://<id>`). Any other origin is rejected before any
 * request logic runs.
 */

import { z } from "zod";

export const OriginAllowlistConfigSchema = z.object({
  /** Exact origin strings to permit (scheme://host[:port]), e.g. `http://localhost:5173`. */
  allowedOrigins: z.array(z.string()).default([]),
  /** When true (default), loopback origins are permitted regardless of `allowedOrigins`. */
  allowedLoopback: z.boolean().default(true),
  /** Optional regex source strings matched against the full origin. Used for the extension origin. */
  allowedOriginsRegex: z.array(z.string()).optional(),
});

export type OriginAllowlistConfig = z.infer<typeof OriginAllowlistConfigSchema>;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/** Normalize a URL hostname: strip IPv6 brackets so `::1` matches the loopback set. */
const normalizeHostname = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

/** Reconstruct an origin string from a parsed URL. `URL.origin` is unreliable: it
 *  serializes to the literal `"null"` for non-special schemes like
 *  `chrome-extension://`, so callers cannot compare against it. */
const reconstructOrigin = (parsed: URL): string => `${parsed.protocol}//${parsed.host}`;

/**
 * The default, zero-configuration policy: loopback hosts plus any
 * `chrome-extension://` origin. The extension id is not known at config time,
 * so the extension scheme is matched by regex rather than enumerated.
 */
export const defaultAllowlistConfig = (): OriginAllowlistConfig => ({
  allowedOrigins: [],
  allowedLoopback: true,
  allowedOriginsRegex: ["^chrome-extension://"],
});

/**
 * Return true when `origin` is permitted by `config`.
 *
 * `origin` is parsed with the URL constructor; a value that is not a valid
 * origin (no `origin`/`protocol`, unparseable) is rejected. Loopback detection
 * inspects the hostname so that any loopback port (`http://127.0.0.1:3000`,
 * `http://localhost:5173`, `http://[::1]:8080`) is accepted when
 * `allowedLoopback` is true.
 */
export const isOriginAllowed = (origin: string, config: OriginAllowlistConfig): boolean => {
  if (typeof origin !== "string" || origin.length === 0) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  // Reject values that are not real origins (no scheme or no host).
  if (parsed.protocol === "" || parsed.protocol === "null:" || parsed.host === "") {
    return false;
  }

  const hostname = normalizeHostname(parsed.hostname);
  const effectiveOrigin = reconstructOrigin(parsed);

  if (config.allowedLoopback && LOOPBACK_HOSTS.has(hostname)) {
    return true;
  }

  if (config.allowedOrigins.includes(effectiveOrigin)) {
    return true;
  }

  const regexes = config.allowedOriginsRegex ?? [];
  for (const source of regexes) {
    try {
      if (new RegExp(source).test(effectiveOrigin)) {
        return true;
      }
    } catch {
      // A malformed regex in config is skipped, never fatal.
    }
  }

  return false;
};
