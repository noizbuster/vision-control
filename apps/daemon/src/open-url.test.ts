import { describe, expect, it, vi } from "vitest";
import { maybeOpenPairingPage, type OpenUrlFn, openUrl, resolveOpenCommand } from "./open-url.js";

describe("resolveOpenCommand", () => {
  const url = "http://127.0.0.1:9/pair?token=t&port=9&host=127.0.0.1";

  it("uses xdg-open on linux with args array only", () => {
    expect(resolveOpenCommand(url, "linux")).toEqual({
      command: "xdg-open",
      args: [url],
    });
  });

  it("uses open on darwin", () => {
    expect(resolveOpenCommand(url, "darwin")).toEqual({
      command: "open",
      args: [url],
    });
  });

  it("uses cmd /c start with empty title on win32", () => {
    expect(resolveOpenCommand(url, "win32")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", url],
    });
  });
});

describe("openUrl", () => {
  it("invokes the runner with the resolved command and args", async () => {
    const runner = vi.fn(async () => undefined);
    const url = "http://127.0.0.1:4321/pair?token=abc&port=4321&host=127.0.0.1";
    await openUrl(url, runner, "linux");
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith("xdg-open", [url]);
  });
});

describe("maybeOpenPairingPage", () => {
  const pairingHttpUrl = "http://127.0.0.1:4321/pair?token=secret-token&port=4321&host=127.0.0.1";

  it("calls openUrl once when openFromMonorepoDev is true on 127.0.0.1", async () => {
    const open: OpenUrlFn = vi.fn(async () => undefined);
    await maybeOpenPairingPage({
      pairingHttpUrl,
      policy: {
        isTty: false,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: true,
      },
      openUrl: open,
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(pairingHttpUrl);
  });

  it("calls openUrl when --open is set", async () => {
    const open: OpenUrlFn = vi.fn(async () => undefined);
    await maybeOpenPairingPage({
      pairingHttpUrl,
      policy: {
        isTty: false,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: false,
      },
      openUrl: open,
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(pairingHttpUrl);
  });

  it("does not call openUrl when --no-open is set", async () => {
    const open: OpenUrlFn = vi.fn(async () => undefined);
    await maybeOpenPairingPage({
      pairingHttpUrl,
      policy: {
        isTty: true,
        openFlag: true,
        noOpenFlag: true,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: true,
      },
      openUrl: open,
    });
    expect(open).toHaveBeenCalledTimes(0);
  });

  it("does not call openUrl for TTY alone without monorepo dev or --open", async () => {
    const open: OpenUrlFn = vi.fn(async () => undefined);
    await maybeOpenPairingPage({
      pairingHttpUrl,
      policy: {
        isTty: true,
        openFlag: false,
        noOpenFlag: false,
        bindHost: "127.0.0.1",
        openFromMonorepoDev: false,
      },
      openUrl: open,
    });
    expect(open).toHaveBeenCalledTimes(0);
  });

  it("does not call openUrl when bind host is not 127.0.0.1", async () => {
    const open: OpenUrlFn = vi.fn(async () => undefined);
    await maybeOpenPairingPage({
      pairingHttpUrl,
      policy: {
        isTty: true,
        openFlag: true,
        noOpenFlag: false,
        bindHost: "::1",
        openFromMonorepoDev: true,
      },
      openUrl: open,
    });
    expect(open).toHaveBeenCalledTimes(0);
  });

  it("swallows openUrl rejection, writes generic stderr without token/URL, and continues", async () => {
    const open: OpenUrlFn = vi.fn(async () => {
      throw new Error("browser missing");
    });
    const errors: string[] = [];
    await expect(
      maybeOpenPairingPage({
        pairingHttpUrl,
        policy: {
          isTty: false,
          openFlag: true,
          noOpenFlag: false,
          bindHost: "127.0.0.1",
          openFromMonorepoDev: false,
        },
        openUrl: open,
        writeError: (message) => {
          errors.push(message);
        },
      }),
    ).resolves.toBeUndefined();
    expect(open).toHaveBeenCalledTimes(1);
    expect(errors).toEqual(["failed to open pairing page\n"]);
    const joined = errors.join("");
    expect(joined).not.toContain("secret-token");
    expect(joined).not.toContain(pairingHttpUrl);
    expect(joined).not.toContain("http://");
  });
});
