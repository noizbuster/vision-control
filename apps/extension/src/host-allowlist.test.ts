import { describe, expect, it } from "vitest";

import {
  CONTENT_SCRIPT_PATH,
  DYNAMIC_SCRIPT_ID,
  hostToOriginPatterns,
  isAllowedUrl,
  isLoopbackHost,
  isLoopbackUrl,
  normalizeHostInput,
  STORAGE_KEY,
  urlMatchesGrantedHosts,
} from "./host-allowlist.js";

describe("normalizeHostInput", () => {
  it("accepts a bare hostname", () => {
    expect(normalizeHostInput("subshell")).toBe("subshell");
  });

  it("accepts a hostname with port and strips the port (Chrome match patterns do not support ports)", () => {
    expect(normalizeHostInput("subshell:10601")).toBe("subshell");
  });

  it("accepts a dotted hostname", () => {
    expect(normalizeHostInput("my-server.local")).toBe("my-server.local");
  });

  it("accepts a dotted hostname with port and strips the port", () => {
    expect(normalizeHostInput("my-server.local:3000")).toBe("my-server.local");
  });

  it("strips http:// protocol prefix", () => {
    expect(normalizeHostInput("http://subshell")).toBe("subshell");
  });

  it("strips https:// protocol prefix", () => {
    expect(normalizeHostInput("https://subshell:443")).toBe("subshell");
  });

  it("strips a trailing path", () => {
    expect(normalizeHostInput("http://subshell:10601/some/path")).toBe("subshell");
  });

  it("lowercases the result", () => {
    expect(normalizeHostInput("SubShell")).toBe("subshell");
  });

  it("rejects empty string", () => {
    expect(normalizeHostInput("")).toBeNull();
  });

  it("rejects whitespace-only string", () => {
    expect(normalizeHostInput("   ")).toBeNull();
  });

  it("rejects wildcard host", () => {
    expect(normalizeHostInput("*")).toBeNull();
  });

  it("rejects <all_urls>-style pattern", () => {
    expect(normalizeHostInput("<all_urls>")).toBeNull();
  });

  it("rejects host containing spaces", () => {
    expect(normalizeHostInput("sub shell")).toBeNull();
  });

  it("rejects a bare protocol with no host", () => {
    expect(normalizeHostInput("http://")).toBeNull();
  });

  it("rejects malformed garbage", () => {
    expect(normalizeHostInput("!!@#$")).toBeNull();
  });
});

describe("hostToOriginPatterns", () => {
  it("returns http + https match patterns for a hostname", () => {
    expect(hostToOriginPatterns("subshell")).toEqual(["http://subshell/*", "https://subshell/*"]);
  });

  it("returns patterns without a port (Chrome match patterns do not support ports)", () => {
    const patterns = hostToOriginPatterns("subshell");
    for (const p of patterns) {
      expect(p).not.toContain(":10601");
    }
  });
});

describe("isLoopbackHost", () => {
  it("returns true for localhost", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
  });

  it("returns true for [::1]", () => {
    expect(isLoopbackHost("[::1]")).toBe(true);
  });

  it("returns false for a custom hostname", () => {
    expect(isLoopbackHost("subshell")).toBe(false);
  });
});

describe("isLoopbackUrl", () => {
  it("returns true for localhost URL on any port", () => {
    expect(isLoopbackUrl("http://localhost:3000/")).toBe(true);
  });

  it("returns true for 127.0.0.1 URL", () => {
    expect(isLoopbackUrl("http://127.0.0.1:5173/")).toBe(true);
  });

  it("returns true for [::1] URL", () => {
    expect(isLoopbackUrl("http://[::1]:8080/")).toBe(true);
  });

  it("returns false for a non-loopback URL", () => {
    expect(isLoopbackUrl("http://subshell:10601/")).toBe(false);
  });

  it("does not treat hostnames with loopback prefixes as loopback", () => {
    expect(isLoopbackUrl("http://localhost.evil.test/")).toBe(false);
    expect(isLoopbackUrl("http://127.0.0.1.evil.test/")).toBe(false);
  });

  it("returns true for https loopback URLs", () => {
    expect(isLoopbackUrl("https://localhost:3000/")).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isLoopbackUrl(undefined)).toBe(false);
  });
});

describe("urlMatchesGrantedHosts", () => {
  it("returns true when the URL hostname is in the granted list", () => {
    expect(urlMatchesGrantedHosts("http://subshell:10601/", ["subshell"])).toBe(true);
  });

  it("returns true for https on a granted host", () => {
    expect(urlMatchesGrantedHosts("https://subshell/path", ["subshell"])).toBe(true);
  });

  it("returns true when the URL uses a different port than the grant (ports are not part of the grant)", () => {
    expect(urlMatchesGrantedHosts("http://subshell:9999/", ["subshell"])).toBe(true);
  });

  it("returns false when the URL hostname is NOT in the granted list", () => {
    expect(urlMatchesGrantedHosts("http://other-host/", ["subshell"])).toBe(false);
  });

  it("returns false for an empty granted list", () => {
    expect(urlMatchesGrantedHosts("http://subshell:10601/", [])).toBe(false);
  });

  it("returns false for a malformed URL", () => {
    expect(urlMatchesGrantedHosts("not-a-url", ["subshell"])).toBe(false);
  });
});

describe("isAllowedUrl", () => {
  it("returns true for loopback URLs regardless of granted list", () => {
    expect(isAllowedUrl("http://localhost:3000/", [])).toBe(true);
  });

  it("returns true for any http hostname without a grant", () => {
    expect(isAllowedUrl("http://subshell:10601/", [])).toBe(true);
  });

  it("returns true for any https hostname without a grant", () => {
    expect(isAllowedUrl("https://app.example.com/path", [])).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isAllowedUrl(undefined, ["subshell"])).toBe(false);
  });

  it("returns false for a non-http scheme", () => {
    expect(isAllowedUrl("chrome://extensions", [])).toBe(false);
  });
});

describe("constants", () => {
  it("STORAGE_KEY is a non-empty string", () => {
    expect(STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it("DYNAMIC_SCRIPT_ID is a non-empty string", () => {
    expect(DYNAMIC_SCRIPT_ID.length).toBeGreaterThan(0);
  });

  it("CONTENT_SCRIPT_PATH points to the compiled content script", () => {
    expect(CONTENT_SCRIPT_PATH).toBe("content-scripts/content.js");
  });
});
