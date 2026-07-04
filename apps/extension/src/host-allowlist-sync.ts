/**
 * Background-side host-allowlist synchronisation.
 *
 * The `HostAllowlistCache` is the single in-memory source of truth for granted
 * non-loopback hosts. It persists to `chrome.storage.local`, keeps a dynamic
 * content-script registration in sync (`chrome.scripting`), and exposes the
 * unified `isAllowedUrl` predicate the background uses to gate tab tracking.
 *
 * The panel-side permission request (`chrome.permissions.request`) must happen
 * from a user gesture in the panel context. On grant, the panel writes the host
 * to storage; the background picks it up via `storage.onChanged` (or the panel
 * calls `cache.addHost` directly when the background owns the call path).
 */

import {
  CONTENT_SCRIPT_PATH,
  DYNAMIC_SCRIPT_ID,
  hostToOriginPatterns,
  isAllowedUrl as isAllowedUrlPure,
  isLoopbackHost,
  STORAGE_KEY,
} from "./host-allowlist.js";

type ChromeStorageArea = chrome.storage.StorageArea;

function getStorage(): ChromeStorageArea | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  return chrome.storage?.local;
}

function getScripting(): typeof chrome.scripting | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  return chrome.scripting;
}

export async function readGrantedHosts(): Promise<string[]> {
  const storage = getStorage();
  if (storage === undefined) {
    return [];
  }
  const result = await storage.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((host): host is string => typeof host === "string");
}

export async function writeGrantedHosts(hosts: readonly string[]): Promise<void> {
  const storage = getStorage();
  if (storage === undefined) {
    return;
  }
  await storage.set({ [STORAGE_KEY]: [...hosts] });
}

/**
 * Synchronise the dynamic content-script registration with the granted-host list.
 *
 * Non-loopback hosts are registered dynamically (id `vc-granted-hosts`) so the
 * SAME compiled content script injects on runtime-granted origins. Loopback
 * hosts are excluded — they are already covered by the static manifest
 * `content_scripts.matches` and must not be double-injected.
 *
 * If the granted list is empty, the dynamic script is unregistered (if present)
 * and no new registration is created.
 */
export async function syncDynamicContentScript(grantedHosts: readonly string[]): Promise<void> {
  const scripting = getScripting();
  if (scripting === undefined) {
    return;
  }

  await scripting.unregisterContentScripts({ ids: [DYNAMIC_SCRIPT_ID] }).catch(() => {
    // Script may not be registered yet (first run or after revoke). Ignore.
  });

  const nonLoopback = grantedHosts.filter((host) => !isLoopbackHost(host));
  const deduped = [...new Set(nonLoopback)];

  if (deduped.length === 0) {
    return;
  }

  const matches = deduped.flatMap((host) => [...hostToOriginPatterns(host)]);

  await scripting.registerContentScripts([
    {
      id: DYNAMIC_SCRIPT_ID,
      matches,
      js: [CONTENT_SCRIPT_PATH],
      world: "ISOLATED" as chrome.scripting.ExecutionWorld,
      runAt: "document_idle",
    },
  ]);
}

export class HostAllowlistCache {
  private hosts: readonly string[] = [];

  getHosts(): readonly string[] {
    return this.hosts;
  }

  setHosts(hosts: readonly string[]): void {
    this.hosts = [...hosts];
  }

  async initialize(): Promise<void> {
    await this.sync();
  }

  /**
   * Reads the granted-host list from storage and re-syncs the dynamic
   * content-script registration. Called on startup and on storage/permission
   * changes. Idempotent — safe to call repeatedly.
   */
  async sync(): Promise<void> {
    this.hosts = await readGrantedHosts();
    await syncDynamicContentScript(this.hosts);
  }

  isAllowedUrl(url: string | undefined): boolean {
    return isAllowedUrlPure(url, this.hosts);
  }

  async addHost(host: string): Promise<void> {
    if (this.hosts.includes(host)) {
      return;
    }
    this.hosts = [...this.hosts, host];
    await writeGrantedHosts(this.hosts);
    await syncDynamicContentScript(this.hosts);
  }

  async removeHost(host: string): Promise<void> {
    if (!this.hosts.includes(host)) {
      return;
    }
    this.hosts = this.hosts.filter((h) => h !== host);
    await writeGrantedHosts(this.hosts);
    await syncDynamicContentScript(this.hosts);
  }
}

/**
 * Reconciles the cached host list with the actual Chrome permissions. Drops
 * hosts whose origins are no longer in `chrome.permissions.getAll()` — this
 * fires when the user revokes a host via Chrome's Site Access UI rather than
 * the panel.
 */
export async function reconcileHostsWithPermissions(cache: HostAllowlistCache): Promise<void> {
  if (typeof chrome === "undefined" || chrome.permissions?.getAll === undefined) {
    return;
  }
  const all = await chrome.permissions.getAll();
  const grantedOrigins = new Set(all.origins ?? []);
  const current = cache.getHosts();
  const filtered = current.filter((host) => {
    const patterns = hostToOriginPatterns(host);
    return patterns.some((p) => grantedOrigins.has(p));
  });
  if (filtered.length !== current.length) {
    await writeGrantedHosts(filtered);
    cache.setHosts(filtered);
    await syncDynamicContentScript(filtered);
  }
}
