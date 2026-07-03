# ADR-013: MCP loopback HTTP policy

## Status

Accepted (2026-07-03). Reconciles the current transport status with earlier
"HTTP deferred" wording in [ADR-007](./ADR-007-loopback-daemon.md) (line 50),
[ADR-010](./ADR-010-readonly-mcp.md), and
[mcp-policy.md](../agents/mcp-policy.md). Does not weaken the read-only contract.

## Context

The PRD left MCP transport as an open question (section 40, line 2698): "MCP
HTTP transport - from the start, or stdio only?" Earlier docs answered "stdio
only for the MVP, HTTP deferred." The MCP server (`packages/mcp-server`) has
since shipped a loopback HTTP transport alongside stdio:

- `startStdioTransport` serves the standard stdio path for local agent
  integration.
- `startHttpTransport` uses `StreamableHTTPServerTransport` and binds to
  `127.0.0.1` only (never `0.0.0.0` or a public interface). Every request passes
  through `checkAuth` (Bearer token plus origin allowlist) before the transport
  sees it; unauthenticated requests are rejected with no context leakage.

This is a policy drift: the code added loopback HTTP, but
[mCP-policy.md](../agents/mcp-policy.md) still said "Do not add HTTP transport
for MCP in the MVP" and ADR-007 still said HTTP is deferred. This ADR documents
the current status so the docs and the code agree, without expanding the surface
beyond loopback.

The relevant guardrail from [AGENTS.md](../../AGENTS.md): no silent non-localhost
origin expansion. See [security-privacy.md](../agents/security-privacy.md) for
the loopback contract.

## Decision

The MCP server serves two transports, both loopback-only and both read-only:

- **stdio** - the standard local-agent transport.
- **loopback HTTP/WS** - bound to `127.0.0.1` only, behind Bearer-token and
  origin-allowlist authentication. The CLI and `vision-control doctor` reach it
  at `VC_MCP_URL` with `VC_MCP_TOKEN`.

The read-only tool contract (ADR-010) is unchanged by transport. No tool on
either transport writes source, applies patches, or mutates state.

- **No non-loopback expansion without a future ADR.** Binding the MCP HTTP
  transport to a non-loopback interface (LAN, staging origin, cloud) requires a
  new ADR that approves a transport and a threat model. There is no flag, env
  var, or config that silently widens the bind today, and none will be added
  without that ADR.
- **No shared auth domain with the daemon.** The daemon serves the extension;
  the MCP server serves agent tooling. They stay on separate transports with
  separate tokens (ADR-007).

## Consequences

- Agents and the CLI can reach the MCP server over loopback HTTP when stdio is
  inconvenient, without any network exposure.
- The earlier "HTTP deferred" wording in ADR-007 and mcp-policy.md is superseded
  for the loopback-only case. Non-loopback HTTP remains deferred.
- The freshness test asserts the policy text stays current, so a future change
  to the transport surface must update this ADR and the policy doc together.

## MVP Guardrail

This ADR protects against silent non-loopback expansion of the MCP transport
(AGENTS.md guardrail: no silent non-localhost origin expansion). It reconciles
the docs with the shipped loopback HTTP path while keeping the hard line: the
read-only MCP contract (ADR-010) is unaffected by transport, and any move off
loopback requires an explicit future ADR. It does not admit staging or remote
origins (PRD open question 10, line 2701); that decision is deferred.
