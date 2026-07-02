import type { Logger } from "@vision-control/logger";
import type {
  SourceRange,
  SourceRegistryInsert,
  SourceRegistryRepository,
  SourceRegistryRow,
} from "@vision-control/storage";
import type { WorkspaceService } from "./workspace-service.js";

export interface SourceRegistryServiceDeps {
  readonly sourceRepo: SourceRegistryRepository;
  readonly workspaceService: WorkspaceService;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

export interface RegisterSourceInput {
  readonly sessionId: string;
  readonly sourceId: string;
  readonly filePath: string;
  readonly range: SourceRange;
  readonly fingerprint: string;
  readonly componentName?: string;
}

/**
 * Wraps the source-registry repository with the workspace-binding guard and an
 * audit trail. Source reads require the session to be bound to a workspace;
 * an unbound session raises {@link WorkspaceNotBoundError} (→ `WORKSPACE_NOT_BOUND`).
 */
export class SourceRegistryService {
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(private readonly deps: SourceRegistryServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.uuid = deps.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
  }

  /** Register a source mapping for the session's bound workspace. */
  register(input: RegisterSourceInput): SourceRegistryRow {
    const workspaceId = this.deps.workspaceService.assertBound(input.sessionId);
    const insert: SourceRegistryInsert = {
      id: this.uuid(),
      workspace_id: workspaceId,
      source_id: input.sourceId,
      file_path: input.filePath,
      range: input.range,
      fingerprint: input.fingerprint,
      ...(input.componentName !== undefined ? { componentName: input.componentName } : {}),
      captured_at: this.now(),
    };
    this.deps.sourceRepo.insert(insert);
    this.deps.logger.debug("Source registered", { sourceId: input.sourceId, workspaceId });
    return this.deps.sourceRepo.findById(insert.id) as SourceRegistryRow;
  }

  /** Read a source mapping by source id. Requires a bound session. */
  getBySourceId(sourceId: string, sessionId: string): SourceRegistryRow | undefined {
    // assertBound throws WorkspaceNotBoundError when the session is not bound —
    // this is the WORKSPACE_NOT_BOUND enforcement point.
    this.deps.workspaceService.assertBound(sessionId);
    return this.deps.sourceRepo.findBySourceId(sourceId);
  }

  listByWorkspace(workspaceId: string): readonly SourceRegistryRow[] {
    return this.deps.sourceRepo.listByWorkspace(workspaceId);
  }
}
