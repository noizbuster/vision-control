import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createProgram,
  getPreEmitDiagnostics,
  parseJsonConfigFileContent,
  readConfigFile,
  sys,
} from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RETIRED_DAEMON_EXPORTS = [
  "startDaemon",
  "tryStartDaemon",
  "withDaemon",
  "resolveDaemonBinaryPath",
  "DaemonBinaryMissingError",
] as const;

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
let buildDirectory = "";
let declaration = "";
let runtimeExports: readonly string[] = [];

beforeAll(async () => {
  buildDirectory = mkdtempSync(join(packageRoot, ".public-api-build-"));
  const configPath = join(packageRoot, "tsconfig.build.json");
  const configFile = readConfigFile(configPath, sys.readFile);
  expect(configFile.error).toBeUndefined();

  const config = parseJsonConfigFileContent(
    configFile.config,
    sys,
    packageRoot,
    { outDir: buildDirectory },
    configPath,
  );
  const program = createProgram(config.fileNames, config.options);
  const emit = program.emit();
  expect([...getPreEmitDiagnostics(program), ...emit.diagnostics]).toEqual([]);

  declaration = readFileSync(join(buildDirectory, "index.d.ts"), "utf8");
  const runtime = await import(pathToFileURL(join(buildDirectory, "index.js")).href);
  runtimeExports = Object.keys(runtime);
});

afterAll(() => {
  if (buildDirectory.length > 0) {
    rmSync(buildDirectory, { recursive: true, force: true });
  }
});

describe("testing package public build", () => {
  it.each(RETIRED_DAEMON_EXPORTS)("omits %s from the runtime package root", (name) => {
    expect(runtimeExports).not.toContain(name);
  });

  it.each(RETIRED_DAEMON_EXPORTS)("omits %s from public declarations", (name) => {
    expect(declaration).not.toMatch(new RegExp(`\\b${name}\\b`, "u"));
  });
});
