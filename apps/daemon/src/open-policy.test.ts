import { describe, expect, it } from "vitest";
import { shouldOpenBrowser } from "./open-policy.js";

describe("shouldOpenBrowser", () => {
  it("returns false for TTY + 127.0.0.1 with no flags and openFromMonorepoDev false", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: false,
      }),
    ).toBe(false);
  });

  it("returns true for non-TTY when openFromMonorepoDev is true", () => {
    expect(
      shouldOpenBrowser({
        isTty: false,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: true,
      }),
    ).toBe(true);
  });

  it("returns true when --open forces open on non-TTY", () => {
    expect(
      shouldOpenBrowser({
        isTty: false,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: false,
      }),
    ).toBe(true);
  });

  it("returns false when --no-open is set even with openFromMonorepoDev true", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: true,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: true,
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
        openFromMonorepoDev: true,
      }),
    ).toBe(false);
  });

  it("returns false for bindHost ::1 even with openFromMonorepoDev true", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "::1",
        openFromMonorepoDev: true,
      }),
    ).toBe(false);
  });

  it("returns false for bindHost localhost even with openFromMonorepoDev true", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "localhost",
        openFromMonorepoDev: true,
      }),
    ).toBe(false);
  });

  it("returns true for openFromMonorepoDev + 127.0.0.1", () => {
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: true,
      }),
    ).toBe(true);
  });

  it("returns false for non-127.0.0.1 even with --open (host gate always applies)", () => {
    expect(
      shouldOpenBrowser({
        isTty: false,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "::1",
        openFromMonorepoDev: false,
      }),
    ).toBe(false);
    expect(
      shouldOpenBrowser({
        isTty: true,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "localhost",
        openFromMonorepoDev: true,
      }),
    ).toBe(false);
  });
});
