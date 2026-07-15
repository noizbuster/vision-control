import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consumeStdoutForReady,
  parseReadyLine,
  resolveStartUrlsFromEnv,
} from "./dev-pair-helpers.mjs";

describe("parseReadyLine", () => {
  it("parses a ready JSON line with pairingHttpUrl", () => {
    const line = JSON.stringify({
      event: "ready",
      port: 4321,
      host: "127.0.0.1",
      pairingHttpUrl: "http://127.0.0.1:4321/pair?token=abc&port=4321&host=127.0.0.1",
      sessionId: "sess-1",
    });
    const ready = parseReadyLine(line);
    assert.ok(ready);
    assert.equal(ready.event, "ready");
    assert.equal(ready.port, 4321);
    assert.equal(ready.host, "127.0.0.1");
    assert.equal(
      ready.pairingHttpUrl,
      "http://127.0.0.1:4321/pair?token=abc&port=4321&host=127.0.0.1",
    );
    assert.equal(ready.sessionId, "sess-1");
  });

  it("returns null for non-ready or invalid lines", () => {
    assert.equal(parseReadyLine(""), null);
    assert.equal(parseReadyLine("not json"), null);
    assert.equal(parseReadyLine(JSON.stringify({ event: "other" })), null);
    assert.equal(parseReadyLine(JSON.stringify({ event: "ready" })), null);
    assert.equal(parseReadyLine(JSON.stringify({ event: "ready", pairingHttpUrl: "" })), null);
  });
});

describe("consumeStdoutForReady", () => {
  it("finds ready across chunk boundaries", () => {
    const full = `${JSON.stringify({
      event: "ready",
      port: 9,
      host: "127.0.0.1",
      pairingHttpUrl: "http://127.0.0.1:9/pair?token=t",
    })}\n`;
    const mid = Math.floor(full.length / 2);
    const first = consumeStdoutForReady("", full.slice(0, mid));
    assert.equal(first.ready, null);
    const second = consumeStdoutForReady(first.rest, full.slice(mid));
    assert.ok(second.ready);
    assert.equal(second.ready.port, 9);
  });
});

describe("resolveStartUrlsFromEnv", () => {
  it("prefers VC_DEV_START_URLS over VC_PAIRING_HTTP_URL", () => {
    assert.deepEqual(
      resolveStartUrlsFromEnv({
        VC_DEV_START_URLS: "http://a/, http://b/",
        VC_PAIRING_HTTP_URL: "http://pair/",
      }),
      ["http://a/", "http://b/"],
    );
  });

  it("uses VC_PAIRING_HTTP_URL when multi is unset", () => {
    assert.deepEqual(resolveStartUrlsFromEnv({ VC_PAIRING_HTTP_URL: "http://pair/" }), [
      "http://pair/",
    ]);
  });

  it("returns undefined when neither is set", () => {
    assert.equal(resolveStartUrlsFromEnv({}), undefined);
  });
});
