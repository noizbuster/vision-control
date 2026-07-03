# ADR-015: Share bundles and collaboration trust model

## Status

Accepted (2026-07-03). Defaults V2 sharing to local export/import; defers
remote real-time collaboration.

## Context

The PRD lists "collaboration/session sharing" as a V2 feature (PRD section 7.3,
line 308). The PRD open questions (section 40, line 2701) leave the security UX
for production-like staging origins undecided. ADR-009 established deny-by-
default redaction, and [security-privacy.md](../agents/security-privacy.md)
requires loopback-only daemon binding and no raw daemon/MCP/session tokens in any
payload.

The risk is that "sharing" silently introduces a remote transport, a relay, or a
token-bearing payload that bypasses the loopback and redaction contracts. The
approved V1/V2 plan resolves the owner decision: collaboration starts as
redacted local export/import share bundles; remote real-time collaboration is
deferred until a separate trust-model ADR approves identity, revocation, and
encryption.

Relevant guardrails from [AGENTS.md](../../AGENTS.md) and the plan's "Must NOT
have" list: no collaboration payload may contain passwords, cookies, auth
headers, hidden auth tokens, private keys, bearer tokens, or network bodies; no
silent non-localhost origin expansion.

## Decision

V2 collaboration defaults to local export/import share bundles.

- **Local export/import.** A share bundle is a redacted, signed artifact
  containing the ChangeSet and context, with screenshot metadata only when
  explicitly included and redacted (ADR-011). It carries a signature/hash and an
  audit log. Import into a fresh local session reconstructs operations and
  source candidates without secrets.
- **Token-free.** No raw daemon, MCP, or session token enters a bundle. A tamper
  or unknown-hash bundle is rejected on import.
- **No network relay.** The default path has no relay, no cloud sync, and no
  remote session. The daemon and MCP transports stay loopback-only (ADR-007,
  ADR-013).
- **Remote collaboration deferred.** Remote real-time collaboration, local-
  network sharing, and cloud/P2P transports are deferred until a separate
  trust-model ADR approves a transport, an identity model, a revocation path,
  and encryption. Until that ADR exists, there is no remote sharing surface.

## Consequences

- Users can hand a redacted bundle to another local session or a teammate out of
  band, and import it safely. The bundle is auditable and tamper-detected.
- The default posture introduces no new network surface. A reviewer who wants
  remote collaboration must write the trust-model ADR first.
- The redaction report travels with the bundle so the importer can see what was
  masked without re-exposing values.

## MVP Guardrail

This ADR protects the V2 collaboration feature (PRD 7.3, line 308) from
introducing an unaudited remote transport or a token-bearing payload. It restates
the AGENTS.md guardrails that no collaboration payload bypasses redaction and
that there is no silent non-localhost origin expansion. Remote real-time
collaboration is explicitly deferred, not quietly built, so the loopback and
redaction contracts cannot be eroded by a "convenience" sharing path.
