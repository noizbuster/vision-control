import { resolveBridgePairingInput } from "@vision-control/bridge-client";
import { afterEach, describe, expect, it } from "vitest";

import { runVisionControlContentScript } from "../entrypoints/content.js";
import { createContentHarness } from "./content-entrypoint.test-fixtures.js";

describe("runVisionControlContentScript", () => {
  afterEach(() => {
    delete window.__visionControlContentRuntime;
  });

  it("starts the overlay runtime once when the content script is reinjected", () => {
    // Given: a routeable page where MV3 may execute the content entrypoint twice.
    const harness = createContentHarness();

    // When: the same isolated-world script runs twice in the same page lifetime.
    runVisionControlContentScript(harness.deps);
    runVisionControlContentScript(harness.deps);

    // Then: the overlay is mounted once, while each execution refreshes frame discovery.
    expect(harness.createBus).toHaveBeenCalledTimes(1);
    expect(harness.createRuntime).toHaveBeenCalledTimes(1);
    expect(harness.runtime.start).toHaveBeenCalledTimes(1);
    expect(harness.wireEditHandlers).toHaveBeenCalledTimes(1);
    expect(harness.bus.sent).toHaveLength(2);
    expect(harness.bus.sent.map((entry) => entry.message.messageType)).toEqual([
      "frame-hello",
      "frame-hello",
    ]);
  });

  it("disposes the sentinel resources on pagehide so a fresh page can start", () => {
    // Given: an active content runtime with overlay wiring installed.
    const harness = createContentHarness();
    runVisionControlContentScript(harness.deps);

    // When: the browser tears down the document.
    const pagehide = harness.pageWindow.addEventListener.mock.calls.find(
      (call: readonly unknown[]) => call[0] === "pagehide",
    );
    const listener = pagehide?.[1];
    expect(listener).toBeTypeOf("function");
    if (typeof listener === "function") listener();

    // Then: resources are disposed and a later execution creates a new runtime.
    expect(harness.editHandlers.dispose).toHaveBeenCalledTimes(1);
    expect(harness.runtime.dispose).toHaveBeenCalledTimes(1);
    expect(harness.bus.dispose).toHaveBeenCalledTimes(1);
    expect(harness.pageWindow.__visionControlContentRuntime).toBeUndefined();

    runVisionControlContentScript(harness.deps);
    expect(harness.createBus).toHaveBeenCalledTimes(2);
    expect(harness.runtime.start).toHaveBeenCalledTimes(2);
  });

  it("does not start an overlay runtime for an unrouteable frame", () => {
    // Given: a frame that can report presence but must not receive edit routing.
    const harness = createContentHarness(false);

    // When: the content entrypoint runs in that frame.
    runVisionControlContentScript(harness.deps);

    // Then: it sends frame discovery without mounting edit-capable DOM listeners.
    expect(harness.createBus).toHaveBeenCalledTimes(1);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.runtime.start).not.toHaveBeenCalled();
    expect(harness.wireEditHandlers).not.toHaveBeenCalled();
    expect(harness.bus.sent).toHaveLength(1);
    expect(harness.bus.sent[0]?.message.messageType).toBe("frame-hello");
  });

  it("auto-connects from a loopback /pair page without mounting the overlay", () => {
    // Given: main-frame load of a loopback pair landing page with token params.
    const harness = createContentHarness({
      href: "http://127.0.0.1:4322/pair?token=abc&port=4322&host=127.0.0.1",
    });

    // When: the content entrypoint runs before any DevTools panel is open.
    runVisionControlContentScript(harness.deps);

    // Then: one bridge-connect is emitted with a parseable vision-control pairing URL.
    expect(harness.createBus).toHaveBeenCalledTimes(1);
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.wireEditHandlers).not.toHaveBeenCalled();
    expect(harness.bus.sent).toHaveLength(1);
    const connect = harness.bus.sent[0];
    expect(connect?.route).toBe("background");
    expect(connect?.message.messageType).toBe("bridge-connect");
    const payload = connect?.message.payload;
    const pairingUrl =
      typeof payload === "object" &&
      payload !== null &&
      "pairingUrl" in payload &&
      typeof payload.pairingUrl === "string"
        ? payload.pairingUrl
        : "";
    expect(pairingUrl).toMatch(/^vision-control:\/\//);
    const parsed = resolveBridgePairingInput(pairingUrl);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.target.token).toBe("abc");
      expect(parsed.target.port).toBe(4322);
      expect(parsed.target.host).toBe("127.0.0.1");
    }
  });

  it("strips the token from the address bar after a successful pair-page read", () => {
    // Given: a main-frame /pair URL that still carries the secret token.
    const token = "secret-pair-token-xyz";
    const harness = createContentHarness({
      href: `http://127.0.0.1:4322/pair?token=${token}&port=4322&host=127.0.0.1`,
    });
    harness.deps.document.title = "Vision Control Pairing";

    // When: auto-pair succeeds and bridge-connect is sent.
    runVisionControlContentScript(harness.deps);

    // Then: history.replaceState rewrites the current entry without token=; port/host remain.
    expect(harness.pageWindow.history.replaceState).toHaveBeenCalledTimes(1);
    const replaceArgs = harness.pageWindow.history.replaceState.mock.calls[0];
    expect(replaceArgs?.[2]).toBeDefined();
    expect(String(replaceArgs?.[2])).not.toContain("token=");
    expect(String(replaceArgs?.[2])).toContain("port=4322");
    expect(String(replaceArgs?.[2])).toContain("host=127.0.0.1");
    expect(harness.pageWindow.location.href).not.toContain("token=");
    expect(harness.pageWindow.location.href).toContain("port=4322");
    expect(harness.pageWindow.location.href).toContain("host=127.0.0.1");
    expect(harness.pageWindow.location.href).not.toContain(token);
    expect(harness.deps.document.title).not.toContain(token);
    expect(harness.deps.document.title.toLowerCase()).not.toContain("token");
    expect(harness.createRuntime).not.toHaveBeenCalled();
  });

  it("does not emit bridge-connect when /pair is missing a token", () => {
    // Given: a loopback /pair page without a pairing token.
    const originalHref = "http://127.0.0.1:4322/pair?port=4322&host=127.0.0.1";
    const harness = createContentHarness({
      href: originalHref,
    });

    // When: the content entrypoint runs.
    runVisionControlContentScript(harness.deps);

    // Then: no connect is attempted, the overlay is not mounted, and the URL is left intact.
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.bus.sent.some((entry) => entry.message.messageType === "bridge-connect")).toBe(
      false,
    );
    expect(harness.pageWindow.history.replaceState).not.toHaveBeenCalled();
    expect(harness.pageWindow.location.href).toBe(originalHref);
  });

  it("leaves a malformed pair URL intact and never mounts the overlay", () => {
    // Given: loopback /pair with an unusable token payload (empty token).
    const originalHref = "http://127.0.0.1:4322/pair?token=&port=4322&host=127.0.0.1";
    const harness = createContentHarness({ href: originalHref });

    // When: synthesis fails on the pair path.
    runVisionControlContentScript(harness.deps);

    // Then: no replaceState, no createRuntime, no bridge-connect.
    expect(harness.createRuntime).not.toHaveBeenCalled();
    expect(harness.pageWindow.history.replaceState).not.toHaveBeenCalled();
    expect(harness.pageWindow.location.href).toBe(originalHref);
    expect(harness.bus.sent.some((entry) => entry.message.messageType === "bridge-connect")).toBe(
      false,
    );
  });

  it("does not auto-connect from a non-pair loopback page", () => {
    // Given: a normal loopback app page (not /pair).
    const harness = createContentHarness({ href: "http://127.0.0.1:5173/app" });

    // When: the content entrypoint runs.
    runVisionControlContentScript(harness.deps);

    // Then: normal overlay startup occurs with no bridge-connect.
    expect(harness.createRuntime).toHaveBeenCalledTimes(1);
    expect(harness.bus.sent.map((entry) => entry.message.messageType)).toEqual(["frame-hello"]);
  });

  it("does not auto-connect from an iframe even on a pair URL", () => {
    // Given: nested frame navigation that happens to hit /pair.
    const harness = createContentHarness({
      href: "http://127.0.0.1:4322/pair?token=abc&port=4322&host=127.0.0.1",
      mainFrame: false,
    });

    // When: the content entrypoint runs in that iframe.
    runVisionControlContentScript(harness.deps);

    // Then: no bridge-connect is sent (main-frame only).
    expect(harness.bus.sent.some((entry) => entry.message.messageType === "bridge-connect")).toBe(
      false,
    );
  });
});
