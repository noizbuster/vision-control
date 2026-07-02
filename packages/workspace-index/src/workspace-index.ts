import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import type { SourceRegistry } from "@vision-control/source-registry";
import { CssTokenIndex, parseCssClasses } from "./css-token-index.js";
import { FileRegistry } from "./file-registry.js";

/** File extensions that the workspace index treats as source files. */
export const SOURCE_EXTENSIONS = new Set([".jsx", ".tsx", ".css", ".scss"]);

const SKIP_DIRECTORIES = new Set(["node_modules", "dist", ".git", ".nx", ".output", "build"]);

/** True when the file name has a source extension the index covers. */
export const isSourceFile = (fileName: string): boolean =>
  SOURCE_EXTENSIONS.has(extname(fileName).toLowerCase());

/**
 * One indexed source file.
 *
 * `absolutePath` is INTERNAL — it is used by the daemon and source resolver to
 * read file contents for snippet extraction. It MUST NEVER be serialized,
 * exported to the browser, persisted, or forwarded to the MCP server. Only
 * `workspaceRelativePath` crosses any boundary.
 */
export interface FileEntry {
  readonly workspaceRelativePath: string;
  readonly absolutePath: string;
  readonly size: number;
  readonly lastModified: number;
  readonly fileHash: string;
}

/** Result of indexing a workspace. */
export interface WorkspaceIndexResult {
  readonly rootPath: string;
  readonly fileRegistry: FileRegistry;
  readonly cssTokens: CssTokenIndex;
  readonly fileCount: number;
}

const hashContent = (content: string): string => createHash("sha256").update(content).digest("hex");

const walkSourceFiles = async (rootPath: string): Promise<string[]> => {
  const results: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await walk(join(dir, entry.name));
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        results.push(join(dir, entry.name));
      }
    }
  };
  await walk(rootPath);
  return results;
};

/**
 * Index all source files in a workspace (PRD 20.2 / 23.5).
 *
 * Walks the file tree under `rootPath`, discovers `.jsx`/`.tsx`/`.css`/`.scss`
 * files, hashes each, and builds a {@link FileRegistry} plus a
 * {@link CssTokenIndex} for static CSS class-token origin.
 */
export const indexWorkspace = async (
  rootPath: string,
  sourceRegistry?: SourceRegistry,
): Promise<WorkspaceIndexResult> => {
  const absRoot = resolve(rootPath);
  const fileRegistry = new FileRegistry(sourceRegistry);
  const cssTokens = new CssTokenIndex();
  const filePaths = await walkSourceFiles(absRoot);

  for (const absPath of filePaths) {
    const relPath = relative(absRoot, absPath).split(sep).join("/");
    let content: string;
    let stats: import("node:fs").Stats;
    try {
      content = await readFile(absPath, "utf8");
      stats = await stat(absPath);
    } catch {
      continue;
    }
    fileRegistry.register({
      workspaceRelativePath: relPath,
      absolutePath: absPath,
      size: stats.size,
      lastModified: stats.mtimeMs,
      fileHash: hashContent(content),
    });
    if (extname(absPath).toLowerCase() === ".css") {
      for (const token of parseCssClasses(content, relPath)) {
        cssTokens.addEntry(token);
      }
    }
  }

  return {
    rootPath: absRoot,
    fileRegistry,
    cssTokens,
    fileCount: fileRegistry.size,
  };
};

/**
 * Stateful workspace index. Holds the file registry and CSS token index so the
 * daemon can serve source lookups without re-walking on every request.
 */
export class WorkspaceIndex {
  readonly rootPath: string;
  private readonly fileRegistry: FileRegistry;
  private readonly cssTokens: CssTokenIndex;

  private constructor(result: WorkspaceIndexResult) {
    this.rootPath = result.rootPath;
    this.fileRegistry = result.fileRegistry;
    this.cssTokens = result.cssTokens;
  }

  static async create(rootPath: string, sourceRegistry?: SourceRegistry): Promise<WorkspaceIndex> {
    const result = await indexWorkspace(rootPath, sourceRegistry);
    return new WorkspaceIndex(result);
  }

  lookup(workspaceRelativePath: string): FileEntry | undefined {
    return this.fileRegistry.lookup(workspaceRelativePath);
  }

  lookupBySourceId(sourceId: string): FileEntry | undefined {
    return this.fileRegistry.lookupBySourceId(sourceId);
  }

  getAll(): readonly FileEntry[] {
    return this.fileRegistry.getAll();
  }

  getCssTokens(): CssTokenIndex {
    return this.cssTokens;
  }

  get fileCount(): number {
    return this.fileRegistry.size;
  }

  async refresh(sourceRegistry?: SourceRegistry): Promise<void> {
    const result = await indexWorkspace(this.rootPath, sourceRegistry);
    this.fileRegistry.clear();
    for (const entry of result.fileRegistry.getAll()) this.fileRegistry.register(entry);
    this.cssTokens.clear();
    for (const name of result.cssTokens.getAllClassNames()) {
      for (const token of result.cssTokens.lookup(name)) this.cssTokens.addEntry(token);
    }
  }
}
