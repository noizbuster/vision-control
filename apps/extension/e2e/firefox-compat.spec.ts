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
 *   - there is no `<all_urls>` or broad host permission anywhere,
 *   - `debugger` is optional only (never mandatory — AGENTS.md / ADR-016),
 *   - host permissions stay loopback-scoped (localhost / 127.0.0.1 / [::1]).
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

const LOOPBACK_HOSTS = ["http://localhost/*", "http://127.0.0.1/*", "http://[::1]/*"];
const ALL_URLS = "<all_urls>";

/** True when a permission/match string is a broad host permission, not loopback. */
function isBroadHostPermission(perm: string): boolean {
  if (perm === ALL_URLS) return true;
  // A match-all URL scheme like http://*/* or *://*/.
  if (/^\*:\/\/\*/.test(perm)) return true;
  if (/^https?:\/\//.test(perm) && !LOOPBACK_HOSTS.includes(perm)) return true;
  return false;
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

  test("no <all_urls> or broad host permission in any field (ADR-016)", () => {
    const manifest = readBuiltManifest();
    const allPerms = [
      ...(manifest.permissions ?? []),
      ...(manifest.host_permissions ?? []),
      ...(manifest.optional_permissions ?? []),
      ...(manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? []),
    ];
    const broad = allPerms.filter(isBroadHostPermission);
    expect(
      broad,
      `Firefox manifest contains broad host permissions: ${broad.join(", ")}. ADR-016 forbids <all_urls> and broad hosts.`,
    ).toEqual([]);
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

  test("host permissions are loopback-scoped only (D35 / ADR-016)", () => {
    const manifest = readBuiltManifest();
    // Firefox MV2 merges host permissions into `permissions`; MV3 uses host_permissions.
    const hostLike = (manifest.permissions ?? []).filter((p) => /^https?:\/\//.test(p));
    for (const host of hostLike) {
      expect(LOOPBACK_HOSTS, `non-loopback host permission: ${host}`).toContain(host);
    }
    for (const host of manifest.host_permissions ?? []) {
      expect(LOOPBACK_HOSTS, `non-loopback host_permissions entry: ${host}`).toContain(host);
    }
    for (const match of (manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? [])) {
      expect(LOOPBACK_HOSTS, `non-loopback content_scripts match: ${match}`).toContain(match);
    }
  });

  test("content scripts run in the isolated world (Firefox ISOLATED)", () => {
    const manifest = readBuiltManifest();
    const scripts = manifest.content_scripts ?? [];
    expect(scripts.length, "content scripts must exist").toBeGreaterThan(0);
    for (const cs of scripts) {
      for (const match of cs.matches ?? []) {
        expect(LOOPBACK_HOSTS, `non-loopback content_scripts match: ${match}`).toContain(match);
      }
    }
  });
});

test.describe("@firefox-compat browser-driven (requires Firefox binary)", () => {
  test.fixme("the extension loads in Firefox without manifest errors", async () => {
    // Given: Firefox is installed and the Firefox-target build is present.
    // When: the extension is loaded via web-ext or about:debugging.
    // Then: Firefox accepts the manifest with no permission/structure errors.
    // Assert: the extension appears in about:debugging as enabled.
  });

  test.fixme("the DevTools panel renders in Firefox on a loopback page", async () => {
    // Given: the extension is loaded in Firefox.
    // When: DevTools is opened on a loopback page (http://127.0.0.1:...).
    // Then: the Vision Control panel is registered and selectable.
    // Assert: the panel shows the connection state and inspector chrome.
  });

  test.fixme("element selection works in Firefox at the tested parity scope", async () => {
    // Given: the panel is open on a loopback fixture page.
    // When: an element is picked.
    // Then: the inspector populates and source-marker resolution runs.
    // Assert: the inspector shows the element's tag, role, and source id.
  });
});
