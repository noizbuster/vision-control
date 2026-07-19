import { afterEach, describe, expect, it, vi } from "vitest";
import { type StartedMcpProcess, startMcpProcess } from "./bin.js";
import { formatPairingStderrLines, mintPairToken, NonLoopbackHostError } from "./bridge/index.js";
import { createStubDeps } from "./stub-deps.js";

describe("startMcpProcess — no daemon required (ADR-020 C2)", () => {
  let processHandle: StartedMcpProcess | undefined;

  afterEach(async () => {
    if (processHandle !== undefined) {
      await processHandle.stop();
      processHandle = undefined;
    }
    vi.restoreAllMocks();
  });

  it("starts without VC_DAEMON_URL and serves discover on the bound port", async () => {
    const stderr: string[] = [];
    processHandle = await startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: (line) => stderr.push(line),
    });

    const response = await fetch(`http://127.0.0.1:${processHandle.port}/discover`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.port).toBe(processHandle.port);
    expect(body.token).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(processHandle.pairToken);
    expect(stderr.join("\n")).toContain(processHandle.pairToken);
  });

  it("accepts an explicit 127.0.0.1 configuration on the existing bridge path", async () => {
    processHandle = await startMcpProcess({
      host: "127.0.0.1",
      port: 0,
      skipStdio: true,
      writeStderr: () => {},
    });

    const response = await fetch(`http://127.0.0.1:${processHandle.port}/discover`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(processHandle.host).toBe("127.0.0.1");
    expect(body.host).toBe("127.0.0.1");
  });

  it("prints the pair token on stderr only (never via discover or stdout channel)", async () => {
    const stderr: string[] = [];
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    processHandle = await startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: (line) => stderr.push(line),
    });

    const stderrText = stderr.join("\n");
    expect(stderrText).toContain(processHandle.pairToken);
    expect(stderrText).toMatch(/pair token/i);

    const tokenOccurrences = stderrText.split(processHandle.pairToken).length - 1;
    expect(tokenOccurrences).toBe(1);

    const stdoutText = stdoutWrite.mock.calls.map(([chunk]) => String(chunk)).join("");
    const stdoutOccurrences = stdoutText.split(processHandle.pairToken).length - 1;
    expect(stdoutOccurrences).toBe(0);

    const discover = await fetch(`http://127.0.0.1:${processHandle.port}/discover`);
    const discoverText = await discover.text();
    const discoverOccurrences = discoverText.split(processHandle.pairToken).length - 1;
    expect(discoverOccurrences).toBe(0);
  });

  it("discover body never contains the pair token", async () => {
    processHandle = await startMcpProcess({ port: 0, skipStdio: true, writeStderr: () => {} });
    const response = await fetch(`http://127.0.0.1:${processHandle.port}/discover`);
    const text = await response.text();
    expect(text).not.toContain(processHandle.pairToken);
    expect(text).not.toMatch(/"token"\s*:/);
  });

  it.each([
    "localhost",
    "::1",
    "0.0.0.0",
    "192.168.1.1",
  ])("refuses prohibited host %s and reports the required literal on stderr", async (host) => {
    const stderr: string[] = [];
    await expect(
      startMcpProcess({
        host,
        port: 0,
        skipStdio: true,
        writeStderr: (line) => stderr.push(line),
      }),
    ).rejects.toThrow(NonLoopbackHostError);
    expect(stderr.join("\n")).toContain("127.0.0.1");
  });

  it("createStubDeps works without a daemon (unpaired shape)", async () => {
    const deps = createStubDeps();
    const session = await deps.getActiveSession();
    expect(session.connected).toBe(false);
    expect(session.note?.toLowerCase()).toContain("pair");
    const changeset = await deps.getChangeset();
    expect(changeset.operationCount).toBe(0);
  });
});

describe("pairing stderr formatting", () => {
  it("includes token and never claims stdout is the channel", () => {
    const state = mintPairToken({ now: () => 0 });
    const lines = formatPairingStderrLines(state, "127.0.0.1", 4322);
    expect(lines.some((line) => line.includes(state.token))).toBe(true);
    const write = vi.fn();
    for (const line of lines) write(line);
    expect(write).toHaveBeenCalled();
  });
});
