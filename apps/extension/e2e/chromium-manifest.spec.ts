import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(HERE, "..");
const CHROME_OUT = path.join(EXT_DIR, ".output", "chrome-mv3");
const MANIFEST_PATH = path.join(CHROME_OUT, "manifest.json");
const LOOPBACK_HOSTS = ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"];
const OPTIONAL_HOSTS = ["http://*/*", "https://*/*"];

interface BuiltManifest {
  readonly host_permissions?: readonly string[];
  readonly optional_host_permissions?: readonly string[];
  readonly optional_permissions?: readonly string[];
  readonly content_scripts?: readonly { readonly matches?: readonly string[] }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function contentScripts(value: unknown): BuiltManifest["content_scripts"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(isRecord).map((script) => {
    const matches = stringArray(script.matches);
    return matches === undefined ? {} : { matches };
  });
}

function readBuiltManifest(): BuiltManifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return {};
  }
  const hostPermissions = stringArray(parsed.host_permissions);
  const optionalHostPermissions = stringArray(parsed.optional_host_permissions);
  const optionalPermissions = stringArray(parsed.optional_permissions);
  const scripts = contentScripts(parsed.content_scripts);
  return {
    ...(hostPermissions === undefined ? {} : { host_permissions: hostPermissions }),
    ...(optionalHostPermissions === undefined
      ? {}
      : { optional_host_permissions: optionalHostPermissions }),
    ...(optionalPermissions === undefined ? {} : { optional_permissions: optionalPermissions }),
    ...(scripts === undefined ? {} : { content_scripts: scripts }),
  };
}

function contentScriptMatches(manifest: BuiltManifest): readonly string[] {
  return (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []);
}

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test.describe("@chromium-manifest Site Access posture", () => {
  test.beforeAll(() => {
    execSync("npx wxt build", { cwd: EXT_DIR, stdio: "inherit" });
  });

  test("the Chromium MV3 build produced a manifest", () => {
    expect(existsSync(MANIFEST_PATH), "chrome-mv3/manifest.json must exist").toBe(true);
  });

  test("mandatory host access and static content scripts stay loopback-scoped", () => {
    const manifest = readBuiltManifest();

    expect(sorted(manifest.host_permissions ?? [])).toEqual(sorted(LOOPBACK_HOSTS));
    expect(sorted(contentScriptMatches(manifest))).toEqual(sorted(LOOPBACK_HOSTS));
  });

  test("broad hosts are optional only so Site Access remains per-host", () => {
    const manifest = readBuiltManifest();
    const mandatoryHosts = [
      ...(manifest.host_permissions ?? []),
      ...contentScriptMatches(manifest),
      ...(manifest.optional_permissions ?? []),
    ];

    expect(mandatoryHosts).not.toContain("http://*/*");
    expect(mandatoryHosts).not.toContain("https://*/*");
    expect(sorted(manifest.optional_host_permissions ?? [])).toEqual(sorted(OPTIONAL_HOSTS));
  });
});
