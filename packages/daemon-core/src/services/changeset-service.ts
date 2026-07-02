import type { Logger } from "@vision-control/logger";
import type { ChangesetInsert, ChangesetRepository, ChangesetRow } from "@vision-control/storage";

export interface ChangesetServiceDeps {
  readonly changesetRepo: ChangesetRepository;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

export interface PersistChangesetInput {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly operations: readonly unknown[];
}

/**
 * Wraps the changeset repository with audit logging. Persisted changesets
 * survive daemon restarts (keyed by workspace + session in SQLite), enabling
 * the restore-on-restart flow.
 */
export class ChangesetService {
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(private readonly deps: ChangesetServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.uuid = deps.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
  }

  /** Persist a changeset. Returns the stored row. */
  persist(input: PersistChangesetInput): ChangesetRow {
    const id = this.uuid();
    const timestamp = this.now();
    const insert: ChangesetInsert = {
      id,
      session_id: input.sessionId,
      workspace_id: input.workspaceId,
      operations: input.operations,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.deps.changesetRepo.insert(insert);
    this.deps.logger.info("Changeset persisted", {
      changesetId: id,
      sessionId: input.sessionId,
      operationCount: input.operations.length,
    });
    return this.deps.changesetRepo.findById(id) as ChangesetRow;
  }

  getById(id: string): ChangesetRow | undefined {
    return this.deps.changesetRepo.findById(id);
  }

  listBySession(sessionId: string): readonly ChangesetRow[] {
    return this.deps.changesetRepo.listBySession(sessionId);
  }

  listByWorkspace(workspaceId: string): readonly ChangesetRow[] {
    return this.deps.changesetRepo.listByWorkspace(workspaceId);
  }

  /** Restore all changesets for a workspace (used on daemon restart). */
  restore(workspaceId: string): readonly ChangesetRow[] {
    const rows = this.deps.changesetRepo.listByWorkspace(workspaceId);
    this.deps.logger.info("Changesets restored", { workspaceId, count: rows.length });
    return rows;
  }

  /** Mark a changeset as committed. */
  commit(id: string): void {
    this.deps.changesetRepo.update(id, { committed: true, updated_at: this.now() });
  }
}
