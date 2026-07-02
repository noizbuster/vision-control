import type { SourceRegistry } from "@vision-control/source-registry";
import type { FileEntry } from "./workspace-index.js";

/**
 * In-memory registry of indexed source files (PRD 20.2).
 *
 * Maps workspace-relative paths to {@link FileEntry} records. Supports a
 * source-id → file lookup path by delegating to a {@link SourceRegistry} so the
 * resolver can turn an opaque source id straight into the file that contains
 * the element.
 */
export class FileRegistry {
  private readonly files = new Map<string, FileEntry>();
  private readonly sourceRegistry: SourceRegistry | undefined;

  constructor(sourceRegistry?: SourceRegistry) {
    this.sourceRegistry = sourceRegistry;
  }

  register(entry: FileEntry): FileEntry {
    this.files.set(entry.workspaceRelativePath, entry);
    return entry;
  }

  lookup(workspaceRelativePath: string): FileEntry | undefined {
    return this.files.get(workspaceRelativePath);
  }

  lookupBySourceId(sourceId: string): FileEntry | undefined {
    if (this.sourceRegistry === undefined) return undefined;
    const entry = this.sourceRegistry.lookup(sourceId);
    if (entry === undefined) return undefined;
    return this.files.get(entry.workspaceRelativePath);
  }

  getAll(): readonly FileEntry[] {
    return [...this.files.values()];
  }

  get size(): number {
    return this.files.size;
  }

  clear(): void {
    this.files.clear();
  }
}
