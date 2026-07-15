/**
 * Pure helpers for the extension:dev-pair workflow.
 * Kept free of process side effects so unit tests can exercise them.
 */

/**
 * Parse a single stdout line for the daemon ready event.
 * @param {string} line
 * @returns {{ event: "ready"; pairingHttpUrl: string; port: number; host: string; sessionId?: string } | null}
 */
export function parseReadyLine(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || !trimmed.includes('"event"')) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    parsed.event !== "ready" ||
    typeof parsed.pairingHttpUrl !== "string" ||
    parsed.pairingHttpUrl.length === 0
  ) {
    return null;
  }
  return {
    event: "ready",
    pairingHttpUrl: parsed.pairingHttpUrl,
    port: typeof parsed.port === "number" ? parsed.port : Number.NaN,
    host: typeof parsed.host === "string" ? parsed.host : "",
    ...(typeof parsed.sessionId === "string" ? { sessionId: parsed.sessionId } : {}),
  };
}

/**
 * Feed a stdout chunk into a line buffer and return the first ready event if present.
 * @param {string} buffer
 * @param {string} chunk
 * @returns {{ ready: ReturnType<typeof parseReadyLine>; rest: string }}
 */
export function consumeStdoutForReady(buffer, chunk) {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    const ready = parseReadyLine(line);
    if (ready !== null) {
      return { ready, rest };
    }
  }
  return { ready: null, rest };
}

/**
 * Resolve WXT webExt.startUrls from env.
 * VC_DEV_START_URLS (comma-separated) wins over VC_PAIRING_HTTP_URL (single).
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {string[] | undefined}
 */
export function resolveStartUrlsFromEnv(env) {
  const multi = env.VC_DEV_START_URLS?.trim();
  if (multi !== undefined && multi.length > 0) {
    const urls = multi
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (urls.length > 0) {
      return urls;
    }
  }
  const single = env.VC_PAIRING_HTTP_URL?.trim();
  if (single !== undefined && single.length > 0) {
    return [single];
  }
  return undefined;
}
