/**
 * Adapters that bridge the daemon-core service classes to the narrow read-side
 * port interfaces declared in `@vision-control/mcp-server#daemon-deps`.
 *
 * `mcp-server` stays free of any daemon-core / storage runtime dependency
 * (Task 10 design): it defines PORT interfaces (`ChangesetServiceRead`,
 * `SourceRegistryServiceRead`); the daemon app writes the adapters that map the
 * concrete service methods onto those ports. This module is that glue — the only
 * place that knows both shapes.
 *
 * The adapters are read-only and `any`-free: stored JSON is narrowed through
 * type guards before reaching the MCP surface.
 */

import type { ChangesetService, SourceRegistryService } from "@vision-control/daemon-core";
import type {
  ChangesetOperationSummary,
  ChangesetServiceRead,
  CurrentChangesetRead,
  DaemonMcpDepsServices,
  SourceRegistryServiceRead,
} from "@vision-control/mcp-server";

export interface McpAdapterDeps {
  readonly changesetService: ChangesetService;
  readonly sourceRegistryService: SourceRegistryService;
}

/** `typeof x === "object" && x !== null` narrowed to a string-indexed record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reduce one stored operation (raw JSON, `unknown`) to the agent-facing summary
 * shape the MCP `vision_get_changeset` tool returns. Extracts only the fields
 * the summary type carries; enrichment (full descriptions via the
 * context-compiler) lands with Task 13.
 */
function summarizeOperation(op: unknown, index: number): ChangesetOperationSummary {
  if (!isRecord(op)) {
    return { id: `op-${index}`, kind: "unknown", runtime: false, description: "unknown" };
  }
  const kind = typeof op.kind === "string" ? op.kind : "unknown";
  return {
    id: `op-${index}`,
    kind,
    runtime: typeof op.runtime === "boolean" ? op.runtime : false,
    description: kind,
  };
}

/** Parse a stored `operations_json` column into a typed array; never throws. */
function parseOperationsJson(json: string): readonly unknown[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Build the {@link DaemonMcpDepsServices} slice the daemon can supply today:
 * the changeset + source-registry read ports. Session / connection / context /
 * verification ports are wired by Task 13 and Task 16; absent ports degrade
 * gracefully inside `createDaemonMcpDeps`.
 */
export function createDaemonMcpAdapters(deps: McpAdapterDeps): DaemonMcpDepsServices {
  const changesetServiceRead: ChangesetServiceRead = {
    async getCurrent(sessionId: string): Promise<CurrentChangesetRead | undefined> {
      const rows = deps.changesetService.listBySession(sessionId);
      const latest = rows.length > 0 ? rows[rows.length - 1] : undefined;
      if (latest === undefined) {
        return undefined;
      }
      return {
        changesetId: latest.id,
        operations: parseOperationsJson(latest.operations_json).map(summarizeOperation),
      };
    },
  };

  const sourceRegistryServiceRead: SourceRegistryServiceRead = {
    async resolve(
      sourceId: string,
      sessionId: string,
    ): Promise<{ readonly sourceId: string; readonly filePath?: string } | undefined> {
      const row = deps.sourceRegistryService.getBySourceId(sourceId, sessionId);
      if (row === undefined) {
        return undefined;
      }
      return { sourceId: row.source_id, filePath: row.file_path };
    },
  };

  return {
    changesetService: changesetServiceRead,
    sourceRegistryService: sourceRegistryServiceRead,
  };
}
