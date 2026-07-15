import { describe, expect, it } from "vitest";
import { shouldOpenBrowser } from "./open-policy.js";

describe("shouldOpenBrowser", () => {
  it("returns true for TTY + 127.0.0.1 with no flags", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
      }),
    ).toBe(true);
  });

  it("returns false for non-TTY with no flags", () => {
    expect(
      shouldOpenBrowser({
        isTty: false,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
      }),
    ).toBe(false);
  });

  it("returns true when --open forces open on non-TTY", () => {
    expect(
      shouldOpenBrowser({
        isTty: false,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
      }),
    ).toBe(true);
  });

  it("returns false when --no-open is set on TTY", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: true,
        bindHost: "127.0.0.1",
      }),
    ).toBe(false);
  });

  it("returns false when both --open and --no-open are set (no-open wins)", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: true,
        noOpenFlag: true,
        bindHost: "127.0.0.1",
      }),
    ).toBe(false);
  });

  it("returns false for bindHost ::1 without --open", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "::1",
      }),
    ).toBe(false);
  });

  it("returns false for bindHost localhost without --open", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "localhost",
      }),
    ).toBe(false);
  });

  it("returns false for non-127.0.0.1 even with --open (host gate always applies)", () => {
    expect(
      shouldOpenBrowser({
        isTty: false,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "::1",
      }),
    ).toBe(false);
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "localhost",
      }),
    ).toBe(false);
  });
});
