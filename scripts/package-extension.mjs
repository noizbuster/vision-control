import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionOutputDir = join(rootDir, "apps", "extension", ".output");
const destination = join(rootDir, "vision-control-extension.zip");
const pnpmCli = process.env.npm_execpath;
if (pnpmCli === undefined) {
  throw new Error("Run this script through `pnpm package:extension`.");
}

rmSync(destination, { force: true });

if (existsSync(extensionOutputDir)) {
  for (const name of readdirSync(extensionOutputDir)) {
    if (name.endsWith("-chrome.zip")) {
      rmSync(join(extensionOutputDir, name));
    }
  }
}

const result = spawnSync(
  process.execPath,
  [pnpmCli, "--filter", "@vision-control/extension", "zip"],
  {
    cwd: rootDir,
    stdio: "inherit",
  },
);

if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const chromeArchives = readdirSync(extensionOutputDir).filter((name) =>
  name.endsWith("-chrome.zip"),
);

if (chromeArchives.length !== 1) {
  throw new Error(
    `Expected one fresh Chrome archive in ${extensionOutputDir}, found ${chromeArchives.length}`,
  );
}

const archive = chromeArchives[0];

const source = join(extensionOutputDir, archive);
copyFileSync(source, destination);
console.log(`Deployment extension: ${relative(rootDir, destination)}`);
