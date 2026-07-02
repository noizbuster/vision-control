/**
 * @vision-control/workspace-index — public API.
 *
 * Node-only package that indexes source files in a workspace. Walks the file
 * tree, hashes each source file, and builds a CSS class-token index for static
 * class origin resolution.
 *
 * SECURITY: {@link FileEntry.absolutePath} is internal. It is used for file
 * reads inside the daemon only. It MUST NEVER be serialized, exported to the
 * browser, persisted to storage, or forwarded via the MCP server. Only
 * `workspaceRelativePath` crosses any trust boundary.
 */

export {
  type CssTokenEntry,
  CssTokenEntrySchema,
  CssTokenIndex,
  parseCssClasses,
} from "./css-token-index.js";
export { FileRegistry } from "./file-registry.js";
export {
  type FileEntry,
  indexWorkspace,
  isSourceFile,
  SOURCE_EXTENSIONS,
  WorkspaceIndex,
  type WorkspaceIndexResult,
} from "./workspace-index.js";
