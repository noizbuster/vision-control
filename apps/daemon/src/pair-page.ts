import type { IncomingMessage, ServerResponse } from "node:http";

/** Validated query parameters for the loopback pairing landing page. */
export interface PairQueryParams {
  readonly token: string;
  readonly port: number;
  readonly host: string;
}

export type ParsePairQueryResult =
  | { readonly ok: true; readonly params: PairQueryParams }
  | { readonly ok: false; readonly reason: string };

/**
 * Security headers for every `/pair` response (success and 400).
 * Pairing secret may appear briefly in the URL; never cache or leak via Referer.
 */
export const PAIR_SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
} as const;

/** Parse and validate `/pair` query params. Does not consume or invalidate the token. */
export function parsePairQuery(searchParams: URLSearchParams): ParsePairQueryResult {
  const token = searchParams.get("token");
  if (token === null || token.length === 0) {
    return { ok: false, reason: "missing or empty token" };
  }

  const portRaw = searchParams.get("port");
  if (portRaw === null || portRaw.length === 0) {
    return { ok: false, reason: "missing or empty port" };
  }
  if (!/^\d+$/.test(portRaw)) {
    return { ok: false, reason: "port must be an integer" };
  }
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: "port must be an integer between 1 and 65535" };
  }

  const host = searchParams.get("host");
  if (host === null || host.length === 0) {
    return { ok: false, reason: "missing or empty host" };
  }

  return { ok: true, params: { token, port, host } };
}

/** Build the panel-paste deep link from validated params. */
export function buildPairingDeepLink(params: PairQueryParams): string {
  const query = new URLSearchParams({
    token: params.token,
    port: String(params.port),
    host: params.host,
  });
  return `vision-control://pair?${query.toString()}`;
}

/** Escape text for safe inclusion in HTML text/attribute contexts. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Pure HTML builder for the loopback pairing landing page.
 * No external URLs, no scripts (extension handles replaceState later).
 */
export function buildPairPageHtml(params: PairQueryParams): string {
  const deepLink = buildPairingDeepLink(params);
  const safeDeepLink = escapeHtml(deepLink);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>Vision Control Pairing</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
h1{font-size:1.25rem;margin:0 0 1rem}
code{display:block;word-break:break-all;background:#f4f4f5;padding:0.75rem;border-radius:0.25rem;font-size:0.875rem}
p{margin:0 0 0.75rem}
</style>
</head>
<body>
<h1>Vision Control Pairing</h1>
<p>Waiting for the Vision Control extension…</p>
<p>If nothing happens automatically, install or load the Vision Control Chromium extension (Developer mode → Load unpacked), open DevTools on a loopback page, and paste this pairing URL into the Vision Control panel:</p>
<p><code>${safeDeepLink}</code></p>
<p>You can close this tab after the extension connects.</p>
</body>
</html>
`;
}

function pathnameOf(url: string | undefined): string {
  if (url === undefined || url.length === 0) {
    return "/";
  }
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function searchParamsOf(url: string | undefined): URLSearchParams {
  if (url === undefined) {
    return new URLSearchParams();
  }
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) {
    return new URLSearchParams();
  }
  return new URLSearchParams(url.slice(queryIndex + 1));
}

function writePairError(res: ServerResponse, reason: string): void {
  res.writeHead(400, {
    "content-type": "text/plain; charset=utf-8",
    ...PAIR_SECURITY_HEADERS,
  });
  res.end(reason);
}

function writePairSuccess(res: ServerResponse, params: PairQueryParams): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    ...PAIR_SECURITY_HEADERS,
  });
  res.end(buildPairPageHtml(params));
}

/**
 * Loopback HTTP request handler for health and pairing landing.
 * Must never log `req.url` (pairing token may be present in the query).
 */
export function handleDaemonHttpRequest(req: IncomingMessage, res: ServerResponse): void {
  const pathname = pathnameOf(req.url);

  if (pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (pathname === "/pair") {
    const parsed = parsePairQuery(searchParamsOf(req.url));
    if (!parsed.ok) {
      writePairError(res, parsed.reason);
      return;
    }
    writePairSuccess(res, parsed.params);
    return;
  }

  res.writeHead(404);
  res.end("not found");
}
