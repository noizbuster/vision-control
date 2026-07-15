# ADR-015: Share bundles and collaboration trust model

## Status

Accepted (2026-07-03). Defaults V2 sharing to local export/import; defers
remote real-time collaboration. **Product CLI share path superseded
(2026-07-15)** by the extension-SoT / MCP-bridge pivot
([ADR-019](./ADR-019-extension-source-of-truth.md),
[ADR-020](./ADR-020-mcp-bridge-projection.md)).

**Superseded for product CLI:** `vision-control share export|import` as a
shipped product command. The product CLI surface becomes MCP launcher only
(ADR-020 C2).

**Retained:**

- Local, redacted, token-free export as the default sharing posture.
- Panel (and optional future local) export of redacted context snapshots.
- No remote real-time collaboration until a trust-model ADR
  ([ADR-018](./ADR-018-remote-collaboration-deferred.md)).
- No raw MCP/pair/session tokens in any export payload (ADR-009).

## Context

The PRD lists "collaboration/session sharing" as a V2 feature (PRD section 7.3,
line 308). The PRD open questions (section 40, line 2701) leave the security UX
for production-like staging origins undecided. ADR-009 established deny-by-
default redaction, and [security-privacy.md](../agents/security-privacy.md)
requires loopback-only binding for local Node services and no raw MCP/session
tokens in any payload.

The risk is that "sharing" silently introduces a remote transport, a relay, or a
token-bearing payload that bypasses the loopback and redaction contracts. The
approved V1/V2 plan resolved the owner decision: collaboration starts as
redacted local export/import; remote real-time collaboration is deferred until a
separate trust-model ADR approves identity, revocation, and encryption.

The extension-SoT pivot drops the fat product CLI (including share commands).
Panel context export replaces the CLI share path for day-to-day agent handoff.
Relevant guardrails from [AGENTS.md](../../AGENTS.md): no collaboration payload
may contain passwords, cookies, auth headers, hidden auth tokens, private keys,
bearer tokens, or network bodies; no silent non-localhost origin expansion.

## Decision

Local sharing defaults to redacted export from the extension panel (and any
future local import path that keeps the same token-free rules).

- **Panel export.** Users export redacted JSON/Markdown context snapshots from
  the panel without pairing MCP. That is the primary product path under ADR-019.
- **Historical CLI share (v0.2.0).** CLI `share export|import` of signed bundles
  existed. That product CLI path is dropped; the local, token-free, no-relay
  rules remain.
- **Token-free.** No raw MCP, pair, or session token enters an export. Tamper or
  unknown-hash artifacts are rejected on any import path that remains.
- **No network relay.** The default path has no relay, no cloud sync, and no
  remote session. MCP transports stay loopback-only (ADR-013, ADR-020).
- **Remote collaboration deferred.** Remote real-time collaboration remains
  deferred (ADR-018).

## Consequences

- Users hand redacted panel exports to agents or teammates out of band without a
  product CLI share command.
- The default posture introduces no new network surface.
- Remote collaboration still requires the trust-model ADR first (ADR-018).

## MVP Guardrail

This ADR protects collaboration from an unaudited remote transport or a
token-bearing payload. The extension-SoT pivot removes the product CLI share
surface but does **not** introduce remote sharing. No collaboration payload
bypasses redaction. There is no silent non-localhost origin expansion. Remote
real-time collaboration stays deferred (ADR-018).
