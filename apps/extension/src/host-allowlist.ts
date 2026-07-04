/**
 * Runtime host allowlist — pure logic for granting non-loopback origins.
 *
 * Chrome match patterns do NOT support port numbers. A pattern like
 * `http://subshell/*` matches ALL ports on host `subshell` (including :10601,
 * :3000, etc.). Therefore we normalise user input to a bare hostname and request
 * `http://<hostname>/*` + `https://<hostname>/*`. The port the user typed is
 * discarded — the permission covers every port on that host.
 *
 * Loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) are always-on via the
 * static manifest `host_permissions` and are excluded from the dynamic grant
 * flow.
 */

/** Storage key for the persisted granted-host list in `chrome.storage.local`. */
export const STORAGE_KEY = "visionControlGrantedHosts";

/** Script ID for the dynamically-registered content script (granted hosts). */
export const DYNAMIC_SCRIPT_ID = "vc-granted-hosts";

/**
 * Path to the compiled content script, relative to the extension root.
 * Matches WXT's output layout under `.output/chrome-mv3/`.
 */
export const CONTENT_SCRIPT_PATH = "content-scripts/content.js";

const PROTOCOL_RE = /^[a-z]+:\/\//i;
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

/**
 * Normalise user input to a bare lowercase hostname.
 *
 * Strips protocol prefix, trailing path, and port. Returns `null` for empty,
 * wildcard, or syntactically invalid input.
 */
export function normalizeHostInput(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let candidate = trimmed;

  const protoMatch = candidate.match(PROTOCOL_RE);
  if (protoMatch !== null) {
    candidate = candidate.slice(protoMatch[0].length);
  }

  const slashIdx = candidate.indexOf("/");
  if (slashIdx >= 0) {
    candidate = candidate.slice(0, slashIdx);
  }

  const colonIdx = candidate.indexOf(":");
  if (colonIdx >= 0) {
    candidate = candidate.slice(0, colonIdx);
  }

  if (candidate.length === 0) {
    return null;
  }

  if (candidate.includes("*")) {
    return null;
  }

  if (candidate.includes(" ")) {
    return null;
  }

  if (!HOSTNAME_RE.test(candidate)) {
    return null;
  }

  return candidate.toLowerCase();
}

/**
 * Chrome match-pattern origins for a hostname.
 * Returns both `http://` and `https://` variants. No port (Chrome ignores
 * ports in match patterns — a host pattern covers ALL ports).
 */
export function hostToOriginPatterns(host: string): readonly string[] {
  return [`http://${host}/*`, `https://${host}/*`] as const;
}

/** The three always-on loopback hostnames. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;

export function isLoopbackHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "[::1]" || lower === "::1";
}

/** Returns true if the URL targets a loopback origin (any port). */
export function isLoopbackUrl(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }
  return (
    url.startsWith("http://localhost") ||
    url.startsWith("http://127.0.0.1") ||
    url.startsWith("http://[::1]")
  );
}

/**
 * Returns true if the URL's hostname matches any entry in the granted-host list.
 * The granted list contains bare hostnames (no port, no scheme).
 */
export function urlMatchesGrantedHosts(url: string, grantedHosts: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return grantedHosts.some((host) => host.toLowerCase() === hostname);
}

/**
 * The unified allow predicate: loopback OR a granted host.
 * Used by the background service worker to gate tab tracking.
 */
export function isAllowedUrl(url: string | undefined, grantedHosts: readonly string[]): boolean {
  if (isLoopbackUrl(url)) {
    return true;
  }
  if (url === undefined) {
    return false;
  }
  return urlMatchesGrantedHosts(url, grantedHosts);
}
