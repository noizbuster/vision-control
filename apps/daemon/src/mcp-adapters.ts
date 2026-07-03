/**
 * Adapters that bridge the daemon-core service classes + the source-resolution
 * pipeline to the narrow read-side port interfaces declared in
 * `@vision-control/mcp-server#daemon-deps`.
 *
 * `mcp-server` stays free of any daemon-core / storage / source-resolver runtime
 * dependency (Task 10 design): it defines PORT interfaces
 * (`ChangesetServiceRead`, `SourceRegistryServiceRead`, `ContextCompilerRead`,
 * `VerificationCoordinatorRead`); the daemon app writes the adapters that map
 * the concrete services + pipeline onto those ports. This module is that glue —
 * the only place that knows both shapes.
 *
 * The adapters are read-only and `any`-free: stored JSON is narrowed through
 * type guards before reaching the MCP surface. The context-compiler adapter
 * injects a REAL verification plan (never the STUB) so `vision_get_source_context`
 * surfaces real assertions derived from the live changeset.
 */

import { OperationSchema } from "@vision-control/change-ir";
import { compileContext } from "@vision-control/context-compiler";
import type { ChangesetService, SourceRegistryService } from "@vision-control/daemon-core";
import type { Logger } from "@vision-control/logger";
import type {
  ChangesetOperationSummary,
  ChangesetServiceRead,
  ContextCompileInput,
  ContextCompilerRead,
  CurrentChangesetRead,
  DaemonMcpDepsServices,
  SelectionChangedRead,
  SourceRegistryServiceRead,
  VerificationCoordinatorRead,
  VerificationPlanRead,
} from "@vision-control/mcp-server";
import type { SourceRegistry } from "@vision-control/source-registry";
import type { SourceResolver } from "@vision-control/source-resolver";
import { createPlan } from "@vision-control/verification-engine";

export interface McpAdapterDeps {
  readonly changesetService: ChangesetService;
  readonly sourceRegistryService: SourceRegistryService;
  /** Source resolver; when absent the compiler adapter emits no source candidates. */
  readonly resolver?: SourceResolver;
  /** In-memory marker registry backing the resolver. */
  readonly registry?: SourceRegistry;
  readonly workspaceRoot?: string;
  readonly logger?: Logger;
}

/** `typeof x === "object" && x !== null` narrowed to a string-indexed record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reduce one stored operation (raw JSON, `unknown`) to the agent-facing summary
 * shape the MCP `vision_get_changeset` tool returns.
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

/** Read the latest stored operations array for a session; empty when none. */
function latestOperations(service: ChangesetService, sessionId: string): readonly unknown[] {
  const rows = service.listBySession(sessionId);
  const latest = rows.length > 0 ? rows[rows.length - 1] : undefined;
  if (latest === undefined) return [];
  return parseOperationsJson(latest.operations_json);
}

const ASSERTION_FOR_KIND: Readonly<Record<string, string>> = {
  "style-edit": "computed style property matches the edited value",
  "text-edit": "element text content matches the new text",
  "class-add": "added class is present on the element",
  "class-remove": "removed class is absent from the element",
  "class-replace": "old class absent and new class present",
  "resize-element": "computed size matches the resized value",
  "reorder-child": "child appears at the target sibling index",
  "reparent-element": "element is under the target parent",
};

/**
 * Build a REAL (non-STUB) verification plan from the changeset's operations.
 * When the first operation parses as a valid `Operation`, the verification
 * engine's `createPlan` produces the authoritative assertions; otherwise each
 * operation kind maps to a described assertion. An empty changeset yields an
 * empty plan with an explanatory note — never the context-compiler STUB.
 */
function buildVerificationPlan(operations: readonly unknown[]): VerificationPlanRead {
  if (operations.length === 0) {
    return { assertions: [], notes: "no operations in the changeset to verify" };
  }
  const first = operations[0];
  const parsed = OperationSchema.safeParse(first);
  if (parsed.success) {
    const target = parsed.data.target;
    const plan = createPlan(parsed.data, {
      ...(target !== undefined && target.sourceId !== undefined
        ? { sourceId: target.sourceId }
        : {}),
    });
    return {
      assertions: plan.assertions.map((entry) => ({ description: entry.name })),
      notes: `verification plan derived from ${plan.assertions.length} assertion(s) via the verification engine`,
    };
  }
  const descriptions = operations.filter(isRecord).map((op) => {
    const kind = typeof op.kind === "string" ? op.kind : "unknown";
    return ASSERTION_FOR_KIND[kind] ?? `assertion for ${kind}`;
  });
  return {
    assertions: descriptions.map((description) => ({ description })),
    notes: `verification plan derived from ${descriptions.length} operation kind(s)`,
  };
}

const EMPTY_EDGE = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/**
 * Build a minimal {@link SelectionSummary}-shaped value from the last
 * `selection.changed` read model. The daemon does not hold computed styles or a
 * box model (those live in the browser); this fills the required structural
 * fields with empty/zero defaults so `compileContext` produces a valid context.
 * Source-id and tag flow through honestly when known.
 */
function minimalSelectionSummary(selection: SelectionChangedRead | undefined) {
  const tag = selection?.elementTag ?? "unknown";
  const sourceId = selection?.sourceId;
  return {
    identity: {
      runtimeId: selection?.elementId ?? "unknown",
      tagName: tag,
      frameId: "main",
      fingerprint: "",
      confidence: "medium" as const,
      ...(sourceId !== undefined ? { sourceId } : {}),
    },
    breadcrumb: [],
    computedStyle: {
      display: "",
      position: "",
      flexDirection: "",
      alignItems: "",
      justifyContent: "",
      flexBasis: "",
      flexGrow: "",
      width: "",
      height: "",
      padding: "",
      margin: "",
      border: "",
      color: "",
      backgroundColor: "",
      fontSize: "",
      fontWeight: "",
      lineHeight: "",
    },
    boxModel: {
      margin: EMPTY_EDGE,
      border: EMPTY_EDGE,
      padding: EMPTY_EDGE,
      content: { width: 0, height: 0 },
      position: { x: 0, y: 0 },
    },
    classList: [],
    attributes: [],
    semantic: { tagName: tag, textContentPreview: selection?.textPreview ?? "" },
    siblingSummary: { count: 0, index: 0, parentTagName: "" },
    parentLayout: { mode: "unknown" as const, display: "" },
    sourceConfidence: "medium" as const,
  };
}

/**
 * Build the {@link DaemonMcpDepsServices} slice the daemon supplies: the
 * changeset + source-registry read ports plus the context-compiler and
 * verification-coordinator ports wired to the source-resolution pipeline. The
 * compiler adapter injects a REAL verification plan (never the STUB).
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

  const verificationCoordinatorRead: VerificationCoordinatorRead = {
    async getPlan(input?: {
      readonly sessionId?: string;
      readonly changesetId?: string;
    }): Promise<VerificationPlanRead> {
      const sessionId = input?.sessionId;
      if (sessionId === undefined) {
        return { assertions: [], notes: "no active session — plan unavailable" };
      }
      return buildVerificationPlan(latestOperations(deps.changesetService, sessionId));
    },
  };

  const contextCompilerRead: ContextCompilerRead = {
    compile(input: ContextCompileInput): unknown {
      const sessionId = input.sessionId;
      const operations = latestOperations(deps.changesetService, sessionId);
      const plan = buildVerificationPlan(operations);
      const selection = input.selection;
      const sourceId = selection?.sourceId;
      const candidates =
        sourceId !== undefined && deps.resolver !== undefined
          ? deps.resolver.resolveCandidates({
              runtimeId: selection?.elementId ?? "unknown",
              tagName: selection?.elementTag ?? "unknown",
              frameId: "main",
              fingerprint: "",
              confidence: "medium",
              ...(sourceId !== undefined ? { sourceId } : {}),
            })
          : [];
      const compiled = compileContext({
        goal: "Resolve the selected element's source and verify the pending changeset.",
        selection: minimalSelectionSummary(selection),
        changeset: { operations: [], id: "daemon", version: "2.0.0", revision: 0 } as never,
        sourceCandidates: candidates,
        warnings: [],
      });
      return { ...compiled, verificationPlan: plan };
    },
  };

  return {
    changesetService: changesetServiceRead,
    sourceRegistryService: sourceRegistryServiceRead,
    contextCompiler: contextCompilerRead,
    verificationCoordinator: verificationCoordinatorRead,
  };
}
