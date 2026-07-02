import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { WorkspaceNotBoundError } from "../errors.js";

/** The config file name the workspace root is identified by. */
export const CONFIG_FILE_NAME = "vision-control.config.ts";

/**
 * Walk up from `startDir` looking for a `vision-control.config.ts` file.
 * Returns the directory that contains it, or `undefined` if none is found
 * before the filesystem root. Injectable fs/dirname helpers keep this pure
 * (and testable without a real filesystem layout).
 */
export function discoverWorkspaceRoot(
  startDir: string,
  exists: (path: string) => boolean = existsSync,
  parent: (path: string) => string = dirname,
): string | undefined {
  let dir = startDir;
  // Guard against an infinite walk on degenerate input.
  for (let depth = 0; depth < 64; depth += 1) {
    if (exists(join(dir, CONFIG_FILE_NAME))) {
      return dir;
    }
    const next = parent(dir);
    if (next === dir) {
      return undefined;
    }
    dir = next;
  }
  return undefined;
}

/**
 * Tracks runtime workspace bindings. A session must bind to a workspace before
 * it can read source/context (PRD §27.1). Binding is an explicit step after
 * the WebSocket handshake; a session that authenticated but has not bound is
 * refused source reads with `WORKSPACE_NOT_BOUND`.
 */
export class WorkspaceService {
  private readonly bound = new Map<string, string>();

  /** Bind `sessionId` to `workspaceId`. Idempotent. */
  bind(sessionId: string, workspaceId: string): void {
    this.bound.set(sessionId, workspaceId);
  }

  unbind(sessionId: string): void {
    this.bound.delete(sessionId);
  }

  isBound(sessionId: string): boolean {
    return this.bound.has(sessionId);
  }

  getBoundWorkspace(sessionId: string): string | undefined {
    return this.bound.get(sessionId);
  }

  /** Return the bound workspace id, or throw {@link WorkspaceNotBoundError}. */
  assertBound(sessionId: string): string {
    const workspaceId = this.bound.get(sessionId);
    if (workspaceId === undefined) {
      throw new WorkspaceNotBoundError(sessionId);
    }
    return workspaceId;
  }

  /** Clear all bindings (e.g. on shutdown). */
  clear(): void {
    this.bound.clear();
  }
}
