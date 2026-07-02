import type { Logger } from "@vision-control/logger";
import type { ProtocolErrorCode } from "@vision-control/protocol";
import {
  createAuditEvent,
  DEFAULT_PAIRING_TOKEN_TTL_MS,
  generatePairingToken,
  hashPairingToken,
  type PairingToken,
} from "@vision-control/security";
import type { AuditRepository, SessionRepository, SessionRow } from "@vision-control/storage";

/** Result of minting a pairing token. The raw token is shown once; only its hash is persisted. */
export interface PairingIssueResult {
  readonly token: PairingToken;
  readonly sessionId: string;
  readonly workspaceId: string;
}

/** Outcome of validating a pairing token presented on a WebSocket upgrade. */
export type ValidationResult =
  | { readonly ok: true; readonly session: SessionRow }
  | { readonly ok: false; readonly code: ProtocolErrorCode; readonly reason: string };

export interface SessionServiceDeps {
  readonly sessionRepo: SessionRepository;
  readonly auditRepo: AuditRepository;
  readonly logger: Logger;
  readonly now?: () => number;
  readonly uuid?: () => string;
  readonly random?: () => Uint8Array;
  readonly ttlMs?: number;
}

/**
 * Manages pairing tokens and session lifecycle.
 *
 * The daemon mints a pairing token at startup (or on demand) and persists only
 * the SHA-256 hash in the `sessions` table. Every WebSocket upgrade must present
 * a valid (hash-matching, non-expired) token. The raw token is never stored.
 *
 * A token remains valid until it expires or is revoked; the daemon-client's
 * reconnect flow re-authenticates with the same token within its TTL. This is a
 * deliberate MVP choice (the security package's `used` flag is informational).
 */
export class SessionService {
  private readonly now: () => number;
  private readonly uuid: () => string;

  constructor(private readonly deps: SessionServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.uuid = deps.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
  }

  /** Mint a pairing token for `workspaceId` and persist its hash. Returns the raw token (shown once). */
  async issuePairingToken(workspaceId: string, origin?: string): Promise<PairingIssueResult> {
    const sessionId = this.uuid();
    const random = this.deps.random;
    const token = generatePairingToken({
      now: this.now,
      ttlMs: this.deps.ttlMs ?? DEFAULT_PAIRING_TOKEN_TTL_MS,
      ...(random !== undefined ? { randomBytes: (n: number) => random().slice(0, n) } : {}),
    });
    const tokenHash = await hashPairingToken(token.token);
    this.deps.sessionRepo.insert({
      id: sessionId,
      workspace_id: workspaceId,
      token_hash: tokenHash,
      origin: origin ?? "unknown",
      created_at: this.now(),
      expires_at: token.expiresAt,
      last_active_at: this.now(),
    });
    this.deps.auditRepo.insert({
      id: this.uuid(),
      workspace_id: workspaceId,
      event: createAuditEvent({
        type: "session",
        action: "pairing-token-issued",
        actor: "daemon",
        outcome: "success",
        target: sessionId,
      }),
      created_at: this.now(),
    });
    this.deps.logger.info("Pairing token issued", {
      sessionId,
      workspaceId,
      expiresAt: token.expiresAt,
    });
    return { token, sessionId, workspaceId };
  }

  /** Validate a raw pairing token: hash it, look up the session, check expiry. */
  async validatePairingToken(rawToken: string): Promise<ValidationResult> {
    const tokenHash = await hashPairingToken(rawToken);
    const session = this.deps.sessionRepo.findByTokenHash(tokenHash);
    if (session === undefined) {
      return { ok: false, code: "UNAUTHORIZED", reason: "token not recognized" };
    }
    if (this.isExpired(session)) {
      return { ok: false, code: "UNAUTHORIZED", reason: "token expired" };
    }
    this.deps.sessionRepo.touch(session.id, this.now());
    return { ok: true, session };
  }

  isExpired(session: SessionRow): boolean {
    return this.now() >= session.expires_at;
  }

  /** Delete a session (revokes its token). */
  revokeSession(sessionId: string): void {
    this.deps.sessionRepo.delete(sessionId);
    this.deps.logger.info("Session revoked", { sessionId });
  }
}
