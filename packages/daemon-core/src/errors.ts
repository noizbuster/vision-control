import type { ProtocolErrorCode } from "@vision-control/protocol";

/**
 * Base class for typed daemon-core errors. Each subclass pins a protocol error
 * code so a caller can map the thrown error straight onto a wire `error`
 * envelope without re-deriving the code.
 */
export class DaemonCoreError extends Error {
  constructor(
    public readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DaemonCoreError";
  }
}

/**
 * Thrown when a source/context read is attempted before the session has bound
 * to a workspace. Maps to the `WORKSPACE_NOT_BOUND` protocol error.
 */
export class WorkspaceNotBoundError extends DaemonCoreError {
  constructor(public readonly sessionId: string) {
    super("WORKSPACE_NOT_BOUND", `Session ${sessionId} has not bound a workspace.`);
    this.name = "WorkspaceNotBoundError";
  }
}
