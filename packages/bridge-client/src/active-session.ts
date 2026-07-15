/**
 * Multi-tab last-focused active session (ADR-019 C6).
 *
 * Active MCP session = last focused paired tabId. Offline journals stay
 * independent per tab; this tracker only names which tab is "active" for
 * projection when multiple tabs are open.
 */
export class ActiveSessionTracker {
  private focusedTabId: number | undefined;
  private readonly pairedTabIds = new Set<number>();

  /** Record that a tab is paired to the bridge. */
  markPaired(tabId: number): void {
    this.pairedTabIds.add(tabId);
  }

  /** Drop pairing for a tab (tab closed or unpaired). */
  markUnpaired(tabId: number): void {
    this.pairedTabIds.delete(tabId);
    if (this.focusedTabId === tabId) {
      this.focusedTabId = undefined;
    }
  }

  /** Update last-focused tab (from tabs.onActivated / window focus). */
  setFocused(tabId: number): void {
    this.focusedTabId = tabId;
  }

  /**
   * Active session tab: last focused if still paired, else any remaining
   * paired tab, else undefined.
   */
  getActiveTabId(): number | undefined {
    if (this.focusedTabId !== undefined && this.pairedTabIds.has(this.focusedTabId)) {
      return this.focusedTabId;
    }
    for (const tabId of this.pairedTabIds) {
      return tabId;
    }
    return undefined;
  }

  getPairedTabIds(): readonly number[] {
    return [...this.pairedTabIds];
  }

  clear(): void {
    this.pairedTabIds.clear();
    this.focusedTabId = undefined;
  }
}
