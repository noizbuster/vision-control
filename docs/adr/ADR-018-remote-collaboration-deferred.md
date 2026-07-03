# ADR-018: Remote real-time collaboration deferred

## Status

Accepted (2026-07-04). Extends [ADR-015](./ADR-015-share-bundles-collaboration-trust.md),
which made local export/import share bundles the default V2 sharing path. This
ADR records the open trust questions that block any remote sharing surface.

## Context

ADR-015 resolved the V2 collaboration default to local export/import share
bundles: a redacted, signed artifact handed out of band and imported into a
fresh local session, with no network relay and no raw daemon/MCP/session tokens.
That left a single question open: when, and under what conditions, may a remote
real-time collaboration transport ship?

The PRD lists "collaboration/session sharing" as a V2 feature (PRD section 7.3,
line 308) but does not approve a transport. The PRD open questions (section 40)
leave the security UX and the trust model undecided. A remote surface is
materially harder than a local bundle: it needs a mutually authenticated
identity model, a revocation path for leaked or rotated shares, end-to-end
encryption of the live session stream, and a transport policy that does not
weaken the loopback-only daemon/MCP binding established by
[ADR-007](./ADR-007-loopback-daemon.md) and
[ADR-013](./ADR-013-mcp-loopback-http-policy.md).

None of those four pieces (identity, revocation, encryption, transport) is
approved today. Building remote collaboration without them would mean shipping
an unaudited relay that could bypass redaction, expose the loopback daemon or
MCP over the network, or carry a token-bearing payload — each of which violates
an existing guardrail.

## Decision

Remote real-time collaboration is deferred. It does not ship until a separate,
dedicated trust-model ADR approves, together:

- **Identity.** A mutually authenticated identity model for the participants of
  a remote session (who may join, how their identity is proven).
- **Revocation.** A revocation path so a leaked, rotated, or revoked share can
  be killed without a protocol break.
- **Encryption.** End-to-end encryption of the live session stream, so the relay
  (if any) cannot read the ChangeSet, context, or screenshot metadata.
- **Transport policy.** A transport that does not expose the loopback daemon or
  MCP over the network and that carries no raw daemon/MCP/session token.

Until that ADR exists, the only collaboration surface is the local
export/import bundle from ADR-015. There is no relay, no cloud sync, no
peer-to-peer transport, and no remote session join. A bundle is the unit of
sharing; it is signed, hashed, audit-logged, token-free, and screenshot-free by
default.

## Consequences

- A reviewer who wants remote collaboration must write the trust-model ADR
  first. The default posture introduces no new network surface.
- The loopback and redaction contracts from ADR-007, ADR-009, ADR-013, and
  ADR-015 cannot be eroded by a "convenience" remote sharing path.
- The local share bundle remains the audit surface: every export and import is
  recorded, every bundle is tamper-detected via content hash, and every
  token-bearing or screenshot-leaking bundle is rejected on import.

## MVP Guardrail

This ADR protects the V2 collaboration feature (PRD 7.3, line 308) from
becoming an unaudited remote transport. It restates the AGENTS.md guardrails:
do not expose the loopback daemon or MCP over the network, do not include raw
daemon/MCP/session tokens in any payload, and do not implement remote
real-time collaboration. Remote collaboration is explicitly deferred — not
quietly built — so the identity, revocation, encryption, and transport
questions are answered before any live remote surface exists.
