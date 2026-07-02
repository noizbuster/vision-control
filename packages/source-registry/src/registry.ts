import {
  type SerializedSourceRegistry,
  SerializedSourceRegistrySchema,
  type SourceEntry,
  SourceEntrySchema,
} from "./types.js";

/**
 * In-memory source-marker registry (PRD 14.1).
 *
 * Holds THREE indexes over the same source of truth:
 *
 * - `entries` — `sourceId -> SourceEntry`. The stable, build-derived mapping.
 *   One entry per distinct JSX source location, regardless of how many DOM
 *   instances render from it.
 *
 * - `fileIndex` — `workspaceRelativePath -> Set<sourceId>`. Lets an HMR module
 *   update drop every entry that came from one file in one call, so stale
 *   markers never survive a hot reload.
 *
 * - `runtimeBindings` — `runtimeId -> sourceId`. The EPHEMERAL, per-DOM-instance
 *   index the content script populates. Five list items rendered from one JSX
 *   line share ONE source entry but each owns a distinct runtime id; this index
 *   is the only thing that tells two instances apart (PRD 14.2).
 *
 * The registry is isomorphic: the daemon uses `entries` (persisted via
 * {@link serialize}) and ignores `runtimeBindings`; the browser content script
 * uses `runtimeBindings` to turn a clicked element back into a source entry.
 */
export class SourceRegistry {
  private readonly entries = new Map<string, SourceEntry>();
  private readonly fileIndex = new Map<string, Set<string>>();
  private readonly runtimeBindings = new Map<string, string>();

  /**
   * Register (or replace) one source entry. Parses the entry through
   * {@link SourceEntrySchema} so an absolute path or non-opaque id fails loudly
   * at the boundary. Returns the parsed, canonicalized entry.
   */
  register(entry: SourceEntry): SourceEntry {
    const parsed = SourceEntrySchema.parse(entry);
    this.entries.set(parsed.sourceId, parsed);
    this.indexFile(parsed.workspaceRelativePath, parsed.sourceId);
    return parsed;
  }

  /** Look up a source entry by its opaque source id. */
  lookup(sourceId: string): SourceEntry | undefined {
    return this.entries.get(sourceId);
  }

  /** All entries that originated from one workspace-relative file (HMR / inspection). */
  listByFile(workspaceRelativePath: string): readonly SourceEntry[] {
    const bucket = this.fileIndex.get(workspaceRelativePath);
    if (bucket === undefined) return [];
    const out: SourceEntry[] = [];
    for (const id of bucket) {
      const entry = this.entries.get(id);
      if (entry !== undefined) out.push(entry);
    }
    return out;
  }

  /**
   * Bind an ephemeral runtime id to a source id. Idempotent: re-binding the
   * same runtime id overwrites the prior binding. The source entry need not be
   * registered yet (a content script may observe an instance before the build
   * marker arrives); {@link lookupByElement} then returns `undefined`.
   */
  bindRuntime(runtimeId: string, sourceId: string): void {
    this.runtimeBindings.set(runtimeId, sourceId);
  }

  /** Drop a runtime binding. Returns whether one existed. */
  unbindRuntime(runtimeId: string): boolean {
    return this.runtimeBindings.delete(runtimeId);
  }

  /**
   * Resolve a DOM element (by runtime id) back to its source entry. This is
   * the read path the inspector / source-resolver uses after the content script
   * has assigned runtime ids.
   */
  lookupByElement(runtimeId: string): SourceEntry | undefined {
    const sourceId = this.runtimeBindings.get(runtimeId);
    if (sourceId === undefined) return undefined;
    return this.entries.get(sourceId);
  }

  /**
   * HMR: drop EVERY entry that originated from `workspaceRelativePath`, plus any
   * runtime bindings that pointed at them. Returns the number of entries
   * removed. The build-time transform re-registers the fresh set on the next
   * pass.
   */
  clearForFile(workspaceRelativePath: string): number {
    const bucket = this.fileIndex.get(workspaceRelativePath);
    if (bucket === undefined) return 0;
    const removed = bucket.size;
    for (const id of bucket) this.entries.delete(id);
    this.dropRuntimeBindingsFor(bucket);
    this.fileIndex.delete(workspaceRelativePath);
    return removed;
  }

  /** Empty the registry entirely (all three indexes). */
  clear(): void {
    this.entries.clear();
    this.fileIndex.clear();
    this.runtimeBindings.clear();
  }

  /** Number of registered source entries. */
  get size(): number {
    return this.entries.size;
  }

  /** Number of bound runtime instances (may exceed `size`: one source, many instances). */
  get runtimeCount(): number {
    return this.runtimeBindings.size;
  }

  /** Serialize for daemon persistence / cross-process transport. */
  serialize(): SerializedSourceRegistry {
    return { version: 1, entries: [...this.entries.values()] };
  }

  /**
   * Replace the registry contents from a serialized blob. Validates through
   * {@link SerializedSourceRegistrySchema}; clears first so the result is an
   * exact mirror of the input.
   */
  deserialize(data: unknown): void {
    const parsed = SerializedSourceRegistrySchema.parse(data);
    this.clear();
    for (const entry of parsed.entries) this.register(entry);
  }

  private indexFile(workspaceRelativePath: string, sourceId: string): void {
    let bucket = this.fileIndex.get(workspaceRelativePath);
    if (bucket === undefined) {
      bucket = new Set();
      this.fileIndex.set(workspaceRelativePath, bucket);
    }
    bucket.add(sourceId);
  }

  private dropRuntimeBindingsFor(sourceIds: ReadonlySet<string>): void {
    const stale: string[] = [];
    for (const [runtimeId, sourceId] of this.runtimeBindings) {
      if (sourceIds.has(sourceId)) stale.push(runtimeId);
    }
    for (const runtimeId of stale) this.runtimeBindings.delete(runtimeId);
  }
}
