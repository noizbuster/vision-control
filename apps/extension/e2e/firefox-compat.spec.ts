import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * @firefox-compat — Firefox parity at the tested scope (ADR-016).
 *
 * This spec validates the Firefox-target BUILD and its manifest security posture
 * WITHOUT requiring a browser binary:
 *   - the Firefox build (WXT `-b firefox`) produces a valid MV2 manifest,
 *   - there is no `<all_urls>` literal,
 *   - `debugger` is optional only (never mandatory — AGENTS.md / ADR-016),
 *   - host permissions cover all http and https page hosts.
 *
 * The browser-driven compatibility checks (load the extension in Firefox,
 * verify the panel renders) are `test.fixme` stubs, matching the repo convention
 * for specs that require a browser binary installed via `playwright install`.
 *
 * Parity claim boundary (ADR-016): support is bounded by what is validated here.
 * Features not validated on Firefox produce explicit unsupported diagnostics
 * rather than silent behavior differences; this spec does NOT claim full Firefox
 * parity beyond the tested scope.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(HERE, "..");
const FIREFOX_OUT = path.join(EXT_DIR, ".output", "firefox-mv2");
const MANIFEST_PATH = path.join(FIREFOX_OUT, "manifest.json");

interface BuiltManifest {
  manifest_version?: number;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  background?: { scripts?: string[]; service_worker?: string };
  content_scripts?: { matches?: string[] }[];
}

function readBuiltManifest(): BuiltManifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as BuiltManifest;
}

const PAGE_HOSTS = ["http://*/*", "https://*/*"];
const ALL_URLS = "<all_urls>";

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

test.describe("@firefox-compat manifest validation", () => {
  test.beforeAll(() => {
    if (!existsSync(MANIFEST_PATH)) {
      execSync("npx wxt build -b firefox", { cwd: EXT_DIR, stdio: "inherit" });
    }
  });

  test("the Firefox build produced a valid manifest", () => {
    expect(existsSync(MANIFEST_PATH), "firefox-mv2/manifest.json must exist").toBe(true);
    const manifest = readBuiltManifest();
    expect(manifest.manifest_version).toBe(2);
  });

  test("Firefox MV2 background uses scripts (not a service worker)", () => {
    const manifest = readBuiltManifest();
    expect(manifest.background?.scripts, "background.scripts must be present").toBeDefined();
    expect(manifest.background?.scripts?.length ?? 0).toBeGreaterThan(0);
    expect(
      manifest.background?.service_worker,
      "Firefox MV2 must not use service_worker",
    ).toBeUndefined();
  });

  test("no <all_urls> literal in any field", () => {
    const manifest = readBuiltManifest();
    const allPerms = [
      ...(manifest.permissions ?? []),
      ...(manifest.host_permissions ?? []),
      ...(manifest.optional_permissions ?? []),
      ...(manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? []),
    ];
    expect(allPerms, "manifest must not contain the literal <all_urls>").not.toContain(ALL_URLS);
  });

  test("debugger is optional only, never mandatory (AGENTS.md / ADR-016)", () => {
    const manifest = readBuiltManifest();
    const perms = manifest.permissions ?? [];
    const optional = manifest.optional_permissions ?? [];
    expect(perms, "debugger must NOT be in mandatory permissions").not.toContain("debugger");
    expect(optional, "debugger should remain available as an optional permission").toContain(
      "debugger",
    );
  });

  test("host permissions cover all http(s) pages", () => {
    const manifest = readBuiltManifest();
    // Firefox MV2 merges host permissions into `permissions`; MV3 uses host_permissions.
    const hostLike = [
      ...(manifest.permissions ?? []).filter((p) => /^https?:\/\//.test(p)),
      ...(manifest.host_permissions ?? []),
    ];
    expect(sorted(hostLike)).toEqual(sorted(PAGE_HOSTS));
    const matches = (manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? []);
    expect(sorted(matches)).toEqual(sorted(PAGE_HOSTS));
  });

  test("content scripts declare http(s) matches", () => {
    const manifest = readBuiltManifest();
    const scripts = manifest.content_scripts ?? [];
    expect(scripts.length, "content scripts must exist").toBeGreaterThan(0);
    const matches = scripts.flatMap((cs) => cs.matches ?? []);
    expect(sorted(matches)).toEqual(sorted(PAGE_HOSTS));
  });
});

test.describe("@firefox-compat browser-driven (requires Firefox binary)", () => {
  // OUT: ADR-016 (Firefox browser-driven parity requires a Firefox binary; out of MVP scope)
  test.fixme("the extension loads in Firefox without manifest errors", async () => {
    // Given: Firefox is installed and the Firefox-target build is present.
    // When: the extension is loaded via web-ext or about:debugging.
    // Then: Firefox accepts the manifest with no permission/structure errors.
    // Assert: the extension appears in about:debugging as enabled.
  });

  // OUT: ADR-016 (Firefox browser-driven parity requires a Firefox binary; out of MVP scope)
  test.fixme("the DevTools panel renders in Firefox on a loopback page", async () => {
    // Given: the extension is loaded in Firefox.
    // When: DevTools is opened on a loopback page (http://127.0.0.1:...).
    // Then: the Vision Control panel is registered and selectable.
    // Assert: the panel shows the connection state and inspector chrome.
  });

  // OUT: ADR-016 (Firefox browser-driven parity requires a Firefox binary; out of MVP scope)
  test.fixme("element selection works in Firefox at the tested parity scope", async () => {
    // Given: the panel is open on a loopback fixture page.
    // When: an element is picked.
    // Then: the inspector populates and source-marker resolution runs.
    // Assert: the inspector shows the element's tag, role, and source id.
  });
});
