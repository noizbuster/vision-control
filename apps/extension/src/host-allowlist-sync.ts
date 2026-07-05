/**
 * Background-side host-allowlist synchronisation.
 *
 * The `HostAllowlistCache` is the single in-memory source of truth for granted
 * non-loopback hosts. It persists to `chrome.storage.local` and exposes the
 * unified `isAllowedUrl` predicate the background uses to gate tab tracking.
 *
 * The actual content-script injection for granted hosts is handled by the
 * background's `tabs.onUpdated` listener via `chrome.scripting.executeScript`
 * (on-demand). This replaced an earlier `registerContentScripts` approach that
 * silently failed to inject on real Chrome for non-loopback hosts.
 *
 * The panel-side permission request (`chrome.permissions.request`) must happen
 * from a user gesture in the panel context. On grant, the panel writes the host
 * to storage; the background picks it up via `storage.onChanged`. If the user
 * grants Site Access through Chrome's native extension UI, reconciliation imports
 * those concrete host grants into storage so the same injection path still works.
 */

import {
  hostToOriginPatterns,
  isAllowedUrl as isAllowedUrlPure,
  isLoopbackHost,
  normalizeHostInput,
  STORAGE_KEY,
} from "./host-allowlist.js";

type ChromeStorageArea = chrome.storage.StorageArea;

function getStorage(): ChromeStorageArea | undefined {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  return chrome.storage?.local;
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
    await reconcileHostsWithPermissions(this);
  }

  /**
   * Reads the granted-host list from storage and updates the in-memory cache.
   * Called on startup and on storage/permission changes. Idempotent — safe to
   * call repeatedly.
   */
  async sync(): Promise<void> {
    this.hosts = await readGrantedHosts();
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
  }

  async removeHost(host: string): Promise<void> {
    if (!this.hosts.includes(host)) {
      return;
    }
    this.hosts = this.hosts.filter((h) => h !== host);
    await writeGrantedHosts(this.hosts);
  }
}

/**
 * Reconciles the cached host list with the actual Chrome permissions. Drops
 * hosts whose origins are no longer in `chrome.permissions.getAll()` and imports
 * concrete non-loopback hosts that were granted through Chrome's native Site
 * Access UI rather than the panel.
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
  const next = [...filtered];
  for (const host of hostsFromGrantedOrigins(grantedOrigins)) {
    if (!next.includes(host)) {
      next.push(host);
    }
  }
  if (!sameHosts(next, current)) {
    await writeGrantedHosts(next);
    cache.setHosts(next);
  }
}

function hostsFromGrantedOrigins(origins: ReadonlySet<string>): readonly string[] {
  const hosts: string[] = [];
  for (const origin of origins) {
    const host = hostFromGrantedOrigin(origin);
    if (host !== null && !hosts.includes(host)) {
      hosts.push(host);
    }
  }
  return hosts;
}

function hostFromGrantedOrigin(origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }
  if (parsed.hostname.includes("*")) {
    return null;
  }
  if (isLoopbackHost(parsed.hostname)) {
    return null;
  }
  return normalizeHostInput(parsed.hostname);
}

function sameHosts(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((host, index) => right[index] === host);
}
