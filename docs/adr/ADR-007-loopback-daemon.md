# ADR-007: Authenticated loopback daemon

## Status

Accepted (2026-07-02).

## Context

The browser extension needs to talk to a local process that has filesystem access
(for source resolution, workspace indexing, and context compilation). That
process must not expose an open network port. It also must not share an
authentication domain with the MCP server, because the MCP server serves agent
tooling while the daemon serves the extension directly.

The PRD (line 2680) specifies a Node.js daemon. The security model (PRD section
on privacy and Appendix D constraint 6, line 2901) requires that no sensitive DOM
or network data leaks into context exports by default.

## Decision

Run the daemon as a Node process bound to loopback only (`127.0.0.1`). It is
never reachable from the network.

Authentication and transport:

- **Bind**: loopback only. The daemon refuses connections from any non-loopback
  interface.
- **Session token**: a random secret generated per daemon start. The extension
  receives it through a trusted channel (the DevTools panel lifecycle or a local
  handshake). Every request must carry it.
- **Origin allowlist**: the daemon accepts requests only from the extension's
  origin. Unknown origins are rejected before any logic runs.
- **Separation from MCP**: the daemon is the backend for the extension. The MCP
  server (`packages/mcp-server`) is a separate process that serves agent tooling
  through stdio (and optionally HTTP later). They do not share a transport or an
  auth domain. The daemon holds the authoritative state; the MCP server reads
  from it.

Node-only packages (`workspace-index`, `daemon-core`, `storage`, `mcp-server`,
`cli`) are tagged `platform:node` and cannot import browser packages (ADR-003).

## Consequences

- The daemon cannot be accessed from another machine without SSH tunneling. This
  is intentional and matches the local-developer-tool use case.
- The session token must be short-lived and regenerated on restart. The extension
  re-handshakes when the daemon restarts.
- The origin allowlist prevents a malicious local web page from talking to the
  daemon even if it guesses the port.
- MCP HTTP transport is now loopback-only (ADR-013). The server binds to
  `127.0.0.1` behind Bearer-token and origin-allowlist auth. Non-loopback HTTP
  remains deferred (PRD open question 7, line 2698).

## MVP Guardrail

Loopback-only binding and random session tokens are the minimum security posture
for a local daemon that handles source files and DOM context. This decision
protects the MVP from the most obvious local attack: a web page or another local
process reading the user's source through the daemon. Keeping the daemon and MCP
server on separate transports prevents an agent tool from accidentally writing to
the daemon's source layer, reinforcing the read-only MCP contract (ADR-010).
Mandatory `chrome.debugger` is not required for the MVP: the extension works
without it (PRD line 2687).
