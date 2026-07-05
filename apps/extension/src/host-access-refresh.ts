import type { HostAllowlistCache } from "./host-allowlist-sync.js";
import { reconcileHostsWithPermissions } from "./host-allowlist-sync.js";

export interface HostAccessRefreshOptions {
  readonly hostAllowlist: HostAllowlistCache;
  readonly injectOpenTabs: () => Promise<void>;
}

export async function refreshHostAccess(options: HostAccessRefreshOptions): Promise<void> {
  await reconcileHostsWithPermissions(options.hostAllowlist);
  await options.injectOpenTabs();
}
