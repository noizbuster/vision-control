import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPairPageHtml,
  buildPairingDeepLink,
  handleDaemonHttpRequest,
  parsePairQuery,
  PAIR_SECURITY_HEADERS,
} from "./pair-page.js";

describe("parsePairQuery", () => {
  it("accepts non-empty token, integer port 1-65535, and non-empty host", () => {
    const result = parsePairQuery(
      new URLSearchParams("token=abc&port=4321&host=127.0.0.1"),
    );
    expect(result).toEqual({
      ok: true,
      params: { token: "abc", port: 4321, host: "127.0.0.1" },
    });
  });

  it("rejects missing token", () => {
    const result = parsePairQuery(new URLSearchParams("port=9&host=127.0.0.1"));
    expect(result.ok).toBe(false);
  });

  it("rejects empty token", () => {
    const result = parsePairQuery(new URLSearchParams("token=&port=9&host=127.0.0.1"));
    expect(result.ok).toBe(false);
  });

  it("rejects missing port", () => {
    const result = parsePairQuery(new URLSearchParams("token=t&host=127.0.0.1"));
    expect(result.ok).toBe(false);
  });

  it("rejects non-integer port", () => {
    const result = parsePairQuery(new URLSearchParams("token=t&port=abc&host=127.0.0.1"));
    expect(result.ok).toBe(false);
  });

  it("rejects port 0 and port above 65535", () => {
    expect(parsePairQuery(new URLSearchParams("token=t&port=0&host=127.0.0.1")).ok).toBe(false);
    expect(parsePairQuery(new URLSearchParams("token=t&port=65536&host=127.0.0.1")).ok).toBe(
      false,
    );
  });

  it("rejects missing or empty host", () => {
    expect(parsePairQuery(new URLSearchParams("token=t&port=9")).ok).toBe(false);
    expect(parsePairQuery(new URLSearchParams("token=t&port=9&host=")).ok).toBe(false);
  });
});

describe("buildPairPageHtml", () => {
  const params = { token: "secret-token", port: 9, host: "127.0.0.1" } as const;

  it("includes title without the token", () => {
    const html = buildPairPageHtml(params);
    expect(html).toMatch(/<title>[^<]*<\/title>/i);
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "";
    expect(title.toLowerCase()).toContain("vision control");
    expect(title).not.toContain("secret-token");
  });

  it("includes extension install/load instructions and waiting message", () => {
    const html = buildPairPageHtml(params);
    expect(html.toLowerCase()).toMatch(/extension/);
    expect(html.toLowerCase()).toMatch(/waiting for/);
  });

  it("includes the vision-control://pair deep link for manual paste", () => {
    const html = buildPairPageHtml(params);
    const deepLink = buildPairingDeepLink(params);
    expect(deepLink).toBe(
      "vision-control://pair?token=secret-token&port=9&host=127.0.0.1",
    );
    // HTML body must escape & in the query string
    expect(html).toContain(
      "vision-control://pair?token=secret-token&amp;port=9&amp;host=127.0.0.1",
    );
  });

  it("contains no third-party http(s) hosts", () => {
    const html = buildPairPageHtml(params);
    expect(html).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost|\[::1\])/i);
    expect(html).not.toMatch(/cdn\.|fonts\.|googleapis|gstatic|unpkg|jsdelivr/i);
  });

  it("does not reflect raw HTML from token or host into the page", () => {
    const html = buildPairPageHtml({
      token: `"><script>alert(1)</script>`,
      port: 1,
      host: `"><img src=x onerror=alert(1)>`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=");
    // URLSearchParams percent-encodes, then HTML escapes &
    expect(html).toContain("vision-control://pair?token=");
  });
});

describe("PAIR_SECURITY_HEADERS", () => {
  it("requires no-store cache and no-referrer policy", () => {
    expect(PAIR_SECURITY_HEADERS["Cache-Control"]).toBe("no-store");
    expect(PAIR_SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
    expect(PAIR_SECURITY_HEADERS["Content-Security-Policy"]).toMatch(/default-src 'none'/);
  });
});

describe("handleDaemonHttpRequest", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let baseUrl = "";

  afterEach(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => (err ? reject(err) : resolve()));
      });
      server = undefined;
    }
  });

  async function listen(): Promise<void> {
    server = createServer((req, res) => {
      handleDaemonHttpRequest(req, res);
    });
    await new Promise<void>((resolve, reject) => {
      server?.once("error", reject);
      server?.listen(0, "127.0.0.1", () => {
        server?.removeListener("error", reject);
        resolve();
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected TCP address");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  it("serves valid /pair with 200, security headers, and deep link body", async () => {
    await listen();
    const response = await fetch(
      `${baseUrl}/pair?token=t&port=9&host=127.0.0.1`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html;\s*charset=utf-8/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toMatch(/default-src 'none'/);
    const body = await response.text();
    expect(body).toContain("vision-control://pair?token=t&amp;port=9&amp;host=127.0.0.1");
    expect(body).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/i);
  });

  it("returns 400 text for missing token with security headers", async () => {
    await listen();
    const response = await fetch(`${baseUrl}/pair?port=9&host=127.0.0.1`);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toMatch(/text\/plain/i);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).not.toContain("<html");
  });

  it("returns 400 for empty /pair query", async () => {
    await listen();
    const response = await fetch(`${baseUrl}/pair`);
    expect(response.status).toBe(400);
  });

  it("keeps /health as 200 JSON {status:\"ok\"}", async () => {
    await listen();
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown paths and extra /pair segments", async () => {
    await listen();
    expect((await fetch(`${baseUrl}/other`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/pair/extra`)).status).toBe(404);
  });

  it("does not log req.url when handling /pair", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await listen();
      await fetch(`${baseUrl}/pair?token=super-secret-token&port=9&host=127.0.0.1`);
      await fetch(`${baseUrl}/pair`);
      const combined = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .map((args) => args.map(String).join(" "))
        .join("\n");
      expect(combined).not.toContain("super-secret-token");
      expect(combined).not.toContain("/pair?");
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe("handleDaemonHttpRequest direct", () => {
  it("does not require logger and never reads logger for pair", () => {
    const headers: Record<string, string | number | readonly string[]> = {};
    let statusCode = 0;
    let body = "";
    const req = {
      url: "/pair?token=t&port=1&host=127.0.0.1",
      method: "GET",
    } as IncomingMessage;
    const res = {
      writeHead(code: number, hdrs?: Record<string, string | number | readonly string[]>) {
        statusCode = code;
        if (hdrs !== undefined) {
          for (const [k, v] of Object.entries(hdrs)) {
            headers[k.toLowerCase()] = v;
          }
        }
        return res;
      },
      end(chunk?: string) {
        body = chunk ?? "";
        return res;
      },
    } as unknown as ServerResponse;

    handleDaemonHttpRequest(req, res);
    expect(statusCode).toBe(200);
    expect(headers["cache-control"]).toBe("no-store");
    expect(body).toContain("vision-control://pair");
  });
});
