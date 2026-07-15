# ADR-007: Authenticated loopback daemon

## Status

Accepted (2026-07-02). **Partially superseded (2026-07-15)** by
[ADR-019](./ADR-019-extension-source-of-truth.md) and
[ADR-020](./ADR-020-mcp-bridge-projection.md).

**Superseded claims (do not implement as product path):**

- Daemon as the extension backend / always-on Node process for editing.
- Daemon as the authoritative source of truth for page and session state.
- MCP server as a separate process that only reads daemon state.

**Retained (restated in ADR-020):**

- Loopback-only binding for local Node services that talk to the extension or
  agents.
- Separate auth domains / tokens for agent tooling vs extension pair.
- No non-loopback expansion without a future ADR (also ADR-013).

Historical context below describes the v0.2.0 daemon model. New work follows
ADR-019/020.

## Context

The browser extension needed to talk to a local process that had filesystem
access (for source resolution, workspace indexing, and context compilation). That
process must not expose an open network port. It also must not share an
authentication domain with the MCP server, because the MCP server serves agent
tooling while the daemon served the extension directly.

The PRD (line 2680) specified a Node.js daemon. The security model (PRD section
on privacy and Appendix D constraint 6, line 2901) requires that no sensitive DOM
or network data leaks into context exports by default.

The extension-SoT pivot (ADR-019) removes the always-on daemon product path.
Loopback security still applies to the optional MCP bridge (ADR-020).

## Decision

**Historical (v0.2.0):** Run the daemon as a Node process bound to loopback only
(`127.0.0.1`). It is never reachable from the network.

Authentication and transport (historical):

- **Bind**: loopback only. The daemon refuses connections from any non-loopback
  interface.
- **Session token**: a random secret generated per daemon start. The extension
  receives it through a trusted channel (the DevTools panel lifecycle or a local
  handshake). Every request must carry it.
- **Origin allowlist**: the daemon accepts requests only from the extension's
  origin. Unknown origins are rejected before any logic runs.
- **Separation from MCP (historical)**: the daemon was the backend for the
  extension. The MCP server (`packages/mcp-server`) was a separate process that
  served agent tooling through stdio (and later loopback HTTP). They did not
  share a transport or an auth domain. The daemon held authoritative state; the
  MCP server read from it.

**Current product path (ADR-019 / ADR-020):**

- Extension owns edit/journal SoT. No always-on daemon for editing.
- Optional single-process MCP bridge: stdio for agents + loopback discover/WS on
  `127.0.0.1:4322`. Separate agent Bearer token and extension pair token.
- Node-only packages remain tagged `platform:node` and cannot import browser
  packages (ADR-003). Daemon/workspace packages are on the delete inventory
  (ADR-019 C7).

## Consequences

- Loopback-only binding remains the security baseline for any local Node service
  that handles DOM context or agent tooling (now the MCP bridge, not a daemon
  SoT).
- The historical daemon cannot be accessed from another machine without SSH
  tunneling. That intent carries to the MCP bridge.
- MCP HTTP/WS is loopback-only (ADR-013, ADR-020). Non-loopback remains deferred.
- Implementers must not restore daemon-as-SoT without a new ADR that explicitly
  reopens that product path.

## MVP Guardrail

Loopback-only binding and short-lived secrets remain the minimum security
posture for local processes that handle source files and DOM context. The
extension-SoT pivot (ADR-019) removes the daemon as product backend while
**keeping** the loopback and separate-token rules under ADR-020. Mandatory
`chrome.debugger` is not required: the extension works without it (PRD line
2687).
