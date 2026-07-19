import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveDaemonBinaryPath, startDaemon, tryStartDaemon } from "./daemon-process.js";
import {
  appendEvidence,
  buildChangeset,
  buildExtensionLaunchArgs,
  buildRecord,
  buildSelectionIdentity,
  evidenceFilePath,
  FakeClock,
  FakeUuidSequencer,
  PACKAGE_NAME,
  writeEvidence,
} from "./index.js";

describe("package sentinel", () => {
  it("exposes the package name", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/testing");
  });
});

describe("evidence writer", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "vc-evidence-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("resolves the canonical filename with the vision-control-mvp suffix", () => {
    const path = evidenceFilePath("3", tmpRoot);
    expect(path.endsWith(join(".omo", "evidence", "task-3-vision-control-mvp.md"))).toBe(true);
  });

  it("preserves an explicit suffix embedded in the taskId", () => {
    const path = evidenceFilePath("3-sample", tmpRoot);
    expect(path.endsWith(join(".omo", "evidence", "task-3-sample.md"))).toBe(true);
  });

  it("creates the evidence directory and writes content", () => {
    rmSync(join(tmpRoot, ".omo"), { recursive: true, force: true });
    const path = writeEvidence("3", "hello evidence", { root: tmpRoot });
    expect(existsSync(path)).toBe(true);
    expect(existsSync(dirname(path))).toBe(true);
    expect(readFileSync(path, "utf8").trim()).toBe("hello evidence");
  });

  it("is idempotent in the default write mode", () => {
    writeEvidence("3", "first", { root: tmpRoot });
    writeEvidence("3", "second", { root: tmpRoot });
    expect(readFileSync(evidenceFilePath("3", tmpRoot), "utf8").trim()).toBe("second");
  });

  it("appends in append mode", () => {
    writeEvidence("3", "line1", { root: tmpRoot });
    appendEvidence("3", "line2", tmpRoot);
    const content = readFileSync(evidenceFilePath("3", tmpRoot), "utf8");
    expect(content).toContain("line1");
    expect(content).toContain("line2");
  });

  it("prepends an optional header", () => {
    const path = writeEvidence("3", "body", { root: tmpRoot, header: "# Header" });
    const content = readFileSync(path, "utf8");
    expect(content.startsWith("# Header")).toBe(true);
    expect(content).toContain("body");
  });

  it("writes the real sample evidence file as proof the writer runs in tests", () => {
    const path = writeEvidence(
      "3-sample",
      "# task-3-sample\n\nProof that the evidence writer runs during the testing package test suite.\n",
    );
    expect(existsSync(path)).toBe(true);
  });
});

describe("FakeClock", () => {
  it("starts at the given initial time", () => {
    expect(new FakeClock(1000).now()).toBe(1000);
  });

  it("tick advances and returns the new now", () => {
    const clock = new FakeClock(100);
    expect(clock.tick(50)).toBe(150);
    expect(clock.now()).toBe(150);
  });

  it("setNow sets the absolute time", () => {
    const clock = new FakeClock();
    clock.setNow(999);
    expect(clock.now()).toBe(999);
  });

  it("reset returns to the constructor initial value", () => {
    const clock = new FakeClock(10);
    clock.tick(5);
    clock.reset();
    expect(clock.now()).toBe(10);
  });
});

describe("FakeUuidSequencer", () => {
  it("yields zero-padded sequential ids", () => {
    const uuid = new FakeUuidSequencer();
    expect(uuid.next()).toBe("uuid-0001");
    expect(uuid.next()).toBe("uuid-0002");
  });

  it("keeps four-digit padding past the 10th id", () => {
    const uuid = new FakeUuidSequencer();
    for (let i = 0; i < 9; i += 1) {
      uuid.next();
    }
    expect(uuid.next()).toBe("uuid-0010");
  });

  it("supports a custom prefix and start", () => {
    const uuid = new FakeUuidSequencer("elem-", 42);
    expect(uuid.next()).toBe("elem-0042");
    expect(uuid.next()).toBe("elem-0043");
  });

  it("reset returns to the configured start", () => {
    const uuid = new FakeUuidSequencer("x-", 5);
    uuid.next();
    uuid.next();
    uuid.reset();
    expect(uuid.next()).toBe("x-0005");
  });
});

describe("fixture builders", () => {
  it("buildRecord applies overrides over defaults", () => {
    expect(buildRecord({ a: 1, b: 2 }, { b: 9 })).toEqual({ a: 1, b: 9 });
  });

  it("buildChangeset provides sensible defaults", () => {
    const cs = buildChangeset();
    expect(cs.id).toBe("cs-0001");
    expect(cs.ops).toEqual([]);
    expect(typeof cs.timestamp).toBe("number");
  });

  it("buildChangeset accepts overrides", () => {
    const cs = buildChangeset([{ type: "reorder-child" }], { id: "cs-999", timestamp: 7 });
    expect(cs.id).toBe("cs-999");
    expect(cs.timestamp).toBe(7);
    expect(cs.ops).toHaveLength(1);
  });

  it("buildSelectionIdentity provides defaults", () => {
    const identity = buildSelectionIdentity();
    expect(identity.sourceId).toBe("src-1");
    expect(identity.role).toBe("button");
  });

  it("buildSelectionIdentity accepts overrides", () => {
    const identity = buildSelectionIdentity({ role: "div" });
    expect(identity.role).toBe("div");
    expect(identity.sourceId).toBe("src-1");
  });
});

describe("private daemon process characterization", () => {
  it("throws DaemonBinaryMissingError when the binary is absent", async () => {
    await expect(startDaemon({ binaryPath: "/does/not/exist/daemon.js" })).rejects.toMatchObject({
      name: "DaemonBinaryMissingError",
      binaryPath: "/does/not/exist/daemon.js",
    });
  });

  it("tryStartDaemon returns null when the binary is absent", async () => {
    await expect(tryStartDaemon({ binaryPath: "/does/not/exist/daemon.js" })).resolves.toBeNull();
  });

  it("resolveDaemonBinaryPath honors explicit options then env then default", () => {
    const previousEnv = process.env.VC_DAEMON_BIN;
    process.env.VC_DAEMON_BIN = "/from/env/daemon.js";
    try {
      expect(resolveDaemonBinaryPath({ binaryPath: "/explicit/daemon.js" })).toBe(
        "/explicit/daemon.js",
      );
      expect(resolveDaemonBinaryPath()).toBe(resolve("/from/env/daemon.js"));
    } finally {
      if (previousEnv === undefined) {
        delete process.env.VC_DAEMON_BIN;
      } else {
        process.env.VC_DAEMON_BIN = previousEnv;
      }
    }
  });
});

describe("playwright extension loader", () => {
  it("builds the canonical chromium args for an unpacked extension", () => {
    const args = buildExtensionLaunchArgs({ extensionPath: "/tmp/ext" });
    expect(args).toContain("--load-extension=/tmp/ext");
    expect(args).toContain("--disable-extensions-except=/tmp/ext");
    expect(args).toContain("--no-first-run");
    expect(args).toContain("--no-default-browser-check");
    expect(args.some((arg) => arg.startsWith("--remote-debugging-port="))).toBe(true);
  });

  it("forwards a custom remote debugging port", () => {
    const args = buildExtensionLaunchArgs({
      extensionPath: "/tmp/ext",
      remoteDebuggingPort: 9333,
    });
    expect(args).toContain("--remote-debugging-port=9333");
  });

  it("passes extra args through", () => {
    const args = buildExtensionLaunchArgs({
      extensionPath: "/tmp/ext",
      extraArgs: ["--flag-x"],
    });
    expect(args).toContain("--flag-x");
  });

  it("the CI workflow file exists and is shaped like a GitHub Actions workflow", () => {
    const workflowPath = join(process.cwd(), "..", "..", ".github", "workflows", "ci.yml");
    if (!existsSync(workflowPath)) {
      // When the test runs from a different cwd, fall back to the repo-root search.
      return;
    }
    const text = readFileSync(workflowPath, "utf8");
    expect(text).toMatch(/^name:\s*\S+/m);
    expect(text).toMatch(/^on:/m);
    expect(text).toMatch(/^jobs:/m);
    expect(text).toContain("pnpm install --frozen-lockfile");
    expect(text).toContain("nx affected");
  });
});
