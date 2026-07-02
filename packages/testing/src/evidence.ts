import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Options for {@link writeEvidence}. All fields optional.
 */
export interface WriteEvidenceOptions {
  /**
   * Append to an existing evidence file instead of overwriting it.
   * Default: `false` (overwrite -> idempotent on repeat calls).
   */
  readonly append?: boolean;
  /**
   * Workspace root containing `.omo/evidence/`. Defaults to the nearest
   * ancestor of `process.cwd()` that has a `.omo/` dir or a
   * `pnpm-workspace.yaml`, falling back to `process.cwd()`.
   */
  readonly root?: string;
  /** Optional header line prepended above `content` (e.g. a timestamp). */
  readonly header?: string;
}

const DEFAULT_SUFFIX = "vision-control-mvp";

/**
 * Find the workspace root by walking up from `start` looking for a directory
 * that owns `.omo/` or `pnpm-workspace.yaml`. Falls back to `start`.
 */
function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".omo")) || existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
}

function resolveRoot(root: string | undefined): string {
  return resolve(root ?? findWorkspaceRoot(process.cwd()));
}

/**
 * Resolve the canonical evidence path for a task id.
 *
 * - `taskId` with no hyphen -> `task-<id>-vision-control-mvp.md`
 *   (e.g. `"3"` -> `task-3-vision-control-mvp.md`)
 * - `taskId` with a hyphen -> used verbatim
 *   (e.g. `"3-sample"` -> `task-3-sample.md`)
 */
export function evidenceFilePath(taskId: string, root?: string): string {
  const suffix = taskId.includes("-") ? "" : `-${DEFAULT_SUFFIX}`;
  const fileName = `task-${taskId}${suffix}.md`;
  return join(resolveRoot(root), ".omo", "evidence", fileName);
}

/**
 * Write (or append) task evidence under `.omo/evidence/`. Creates the
 * directory if missing. Returns the resolved file path.
 *
 * In the default write mode the call is idempotent: the same `(taskId, content)`
 * pair always produces the same file. Pass `{ append: true }` (or use
 * {@link appendEvidence}) to accumulate across calls.
 */
export function writeEvidence(
  taskId: string,
  content: string,
  options?: WriteEvidenceOptions,
): string {
  const filePath = evidenceFilePath(taskId, options?.root);
  mkdirSync(dirname(filePath), { recursive: true });
  const body = options?.header ? `${options.header}\n${content}\n` : `${content}\n`;
  if (options?.append && existsSync(filePath)) {
    appendFileSync(filePath, body, "utf8");
  } else {
    writeFileSync(filePath, body, "utf8");
  }
  return filePath;
}

/**
 * Append `content` to the evidence file for `taskId`. Convenience wrapper
 * around {@link writeEvidence} with `append: true`.
 */
export function appendEvidence(taskId: string, content: string, root?: string): string {
  return writeEvidence(taskId, content, {
    append: true,
    ...(root !== undefined ? { root } : {}),
  });
}
