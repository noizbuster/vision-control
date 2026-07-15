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

  it("prints the pair token on stderr only (never via discover or stdout channel)", async () => {
    const stderr: string[] = [];
    processHandle = await startMcpProcess({
      port: 0,
      skipStdio: true,
      writeStderr: (line) => stderr.push(line),
    });

    const stderrText = stderr.join("\n");
    expect(stderrText).toContain(processHandle.pairToken);
    expect(stderrText).toMatch(/pair token/i);

    const tokenOccurrences = stderrText.split(processHandle.pairToken).length - 1;
    expect(tokenOccurrences).toBeGreaterThanOrEqual(1);
    expect(tokenOccurrences).toBeLessThanOrEqual(2);

    const discover = await fetch(`http://127.0.0.1:${processHandle.port}/discover`);
    const discoverText = await discover.text();
    expect(discoverText).not.toContain(processHandle.pairToken);
  });

  it("discover body never contains the pair token", async () => {
    processHandle = await startMcpProcess({ port: 0, skipStdio: true, writeStderr: () => {} });
    const response = await fetch(`http://127.0.0.1:${processHandle.port}/discover`);
    const text = await response.text();
    expect(text).not.toContain(processHandle.pairToken);
    expect(text).not.toMatch(/"token"\s*:/);
  });

  it("refuses non-loopback host and reports on stderr", async () => {
    const stderr: string[] = [];
    await expect(
      startMcpProcess({
        host: "0.0.0.0",
        port: 0,
        skipStdio: true,
        writeStderr: (line) => stderr.push(line),
      }),
    ).rejects.toThrow(NonLoopbackHostError);
    expect(stderr.join("\n")).toMatch(/Loopback only|Refusing to bind/i);
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
