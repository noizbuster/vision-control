import { z } from "zod";

/**
 * Source-marker registry types (PRD 14.1 / 27.1).
 *
 * The registry maps an OPAQUE, stable source id (emitted by the build-time
 * Vite plugin) to a workspace-RELATIVE file location plus a source range.
 * Absolute filesystem paths never enter this map: the boundary schemas below
 * reject any value that looks absolute (POSIX `/`, backslash, or a Windows
 * drive letter) before it is stored, serialized, or forwarded to the daemon.
 *
 * This is the isomorphic counterpart to the storage layer's
 * `SourceRegistryRepository` (which applies the same absolute-path guard at
 * the SQLite boundary). Both layers enforce the contract independently so a
 * path leak fails loudly at whichever boundary it hits first.
 */

/**
 * Absolute-path shape: a leading `/` or `\`, or a Windows drive-letter prefix
 * (`C:\`, `D:/`). Mirrors `packages/storage#WorkspaceRelativePathSchema` and
 * `packages/element-identity#ABSOLUTE_PATH_PATTERN`.
 */
const ABSOLUTE_PATH_RE = /^(\/|\\)|^[A-Za-z]:[\\/]/;

/** True when `value` looks like an absolute filesystem path. */
export const isAbsolutePath = (value: string): boolean => ABSOLUTE_PATH_RE.test(value);

/**
 * Workspace-relative path. Rejects absolute paths and parent-dir escapes
 * (`..`) so a marker can never embed a real location.
 */
const WorkspaceRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !isAbsolutePath(value),
    "workspaceRelativePath must be relative, never absolute",
  );

/**
 * Opaque source id. Rejects absolute paths and path separators so a marker
 * value can never be mistaken for (or smuggle) a filesystem location. The id
 * is an opaque hash emitted by the build-time plugin; it carries no path
 * component.
 */
const OpaqueSourceIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !isAbsolutePath(value) && !value.includes("/") && !value.includes("\\"),
    "sourceId must be an opaque token, not a path",
  );

/** Line/column range for a JSX element. Babel convention: lines 1-based, columns 0-based. */
export const SourceRangeSchema = z
  .object({
    startLine: z.number().int().nonnegative(),
    startColumn: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
    endColumn: z.number().int().nonnegative(),
  })
  .refine((r) => r.endLine >= r.startLine, "endLine must be >= startLine");

export type SourceRange = z.infer<typeof SourceRangeSchema>;

/**
 * One registry entry: the stable mapping from an opaque source id to its
 * workspace-relative source location. This is what the daemon persists and what
 * the source resolver (task 23) consults to open a file at a line.
 */
export const SourceEntrySchema = z.object({
  sourceId: OpaqueSourceIdSchema,
  workspaceRelativePath: WorkspaceRelativePathSchema,
  range: SourceRangeSchema,
  componentName: z.string().min(1),
  staticClassName: z.string().min(1).optional(),
  staticText: z.string().optional(),
  fingerprint: z.string().min(1),
  registeredAt: z.number().int().nonnegative(),
});

export type SourceEntry = z.infer<typeof SourceEntrySchema>;

/** Serialized shape for daemon persistence / cross-process transport. */
export const SerializedSourceRegistrySchema = z.object({
  version: z.literal(1),
  entries: z.array(SourceEntrySchema),
});

export type SerializedSourceRegistry = z.infer<typeof SerializedSourceRegistrySchema>;

/**
 * Build a {@link SourceEntry}, stamping `registeredAt` when omitted. Use this
 * factory at every boundary where an entry is constructed so the timestamp is
 * always present and the schema is enforced once, up front.
 */
export const createSourceEntry = (
  input: Omit<SourceEntry, "registeredAt"> & { registeredAt?: number },
): SourceEntry =>
  SourceEntrySchema.parse({
    ...input,
    ...(input.registeredAt !== undefined
      ? { registeredAt: input.registeredAt }
      : { registeredAt: Date.now() }),
  });
