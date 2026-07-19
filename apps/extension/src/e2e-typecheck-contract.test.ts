import { existsSync } from "node:fs";
import path from "node:path";

import { parseJsonConfigFileContent, readConfigFile, sys } from "typescript";
import { describe, expect, it } from "vitest";

import extensionPackage from "../package.json";
import project from "../project.json";

const extensionRoot = process.cwd();
const e2eConfigPath = path.join(extensionRoot, "e2e", "tsconfig.json");

describe("extension E2E TypeScript coverage", () => {
  it("includes every E2E TypeScript file in a maintained strict project", () => {
    // Given
    const configExists = existsSync(e2eConfigPath);

    // When
    expect(configExists, "expected apps/extension/e2e/tsconfig.json to exist").toBe(true);
    if (!configExists) return;
    const config = readConfigFile(e2eConfigPath, sys.readFile);
    expect(config.error, "expected the E2E TypeScript config to parse").toBeUndefined();
    if (config.error) return;
    const parsed = parseJsonConfigFileContent(
      config.config,
      sys,
      extensionRoot,
      undefined,
      e2eConfigPath,
    );
    const expectedFiles = sys.readDirectory(path.join(extensionRoot, "e2e"), [".ts"], undefined, [
      "**/*.ts",
    ]);

    // Then
    expect(parsed.errors).toEqual([]);
    expect(parsed.options.allowImportingTsExtensions).toBe(true);
    expect(parsed.options.noEmit).toBe(true);
    expect([...parsed.fileNames].sort()).toEqual([...expectedFiles].sort());
  });

  it("runs the E2E project from package and Nx typecheck commands", () => {
    // Given
    const packageCommand = extensionPackage.scripts.typecheck;
    const nxCommand = project.targets.typecheck.options.command;

    // When
    const maintainedCommands = [packageCommand, nxCommand];

    // Then
    for (const command of maintainedCommands) {
      expect(command).toContain("tsc --noEmit -p e2e/tsconfig.json");
    }
  });
});
