# MCP Read-Only Policy

This guide defines the MCP server's tool policy for the Vision Control MVP. The
MCP server exposes read-only tools only. There is no source mutation path through
MCP.

Related: [ADR-010](../adr/ADR-010-readonly-mcp.md),
[ADR-012](../adr/ADR-012-deterministic-patch-suggestions.md),
[ADR-013](../adr/ADR-013-mcp-loopback-http-policy.md),
[security-privacy.md](./security-privacy.md).

---

## Core rule

The MCP server (`packages/mcp-server`) gives a coding agent read access to page
state and workspace context. It does not give the agent a way to write source,
modify the preview state machine, or mutate the change journal.

There is no source-mutating MCP tool. There is no
`vision_apply_deterministic_patch` tool and there will not be one in the MVP or
V1 scope. Deterministic patch suggestions (V1) are returned as inert
`suggestedDiff` data, never applied through a tool (ADR-012).

---

## Allowed tools (read-only)

The exact tool set will be finalized when the MCP server is implemented. The
categories are:

**Page inspection**

- Element tree queries (structure, ancestry, breadcrumb)
- Computed style for a selected element
- Box model dimensions
- Class list

**Source context**

- Source marker resolution (opaque token to source location, via the daemon)
- File index queries (which files exist, project structure)
- Component boundary information

**Context export**

- JSON context export (redacted per ADR-009)
- Markdown context export (redacted per ADR-009)

**Change journal**

- Read the current preview state
- Read the change history (append-only from the extension side)

**Verification status**

- Read the result of the last HMR assertion
- Read verification failure reasons

Every tool in these categories is a read. None of them modify state.

---

## Explicitly absent tools

These tools do not exist in the MCP server and must not be added during the MVP:

- `vision_apply_deterministic_patch` (or any name that applies a source patch)
- Any tool that writes to source files
- Any tool that modifies the preview state machine
- Any tool that appends to or reverts the change journal
- Any tool that triggers a build or restart

---

## Why read-only

The preview-to-source distinction is the core contract of Vision Control (PRD
Appendix D constraint 1). Visual edits live in the preview layer until an agent or
human applies a real patch. If the MCP server could apply patches, an agent could
skip the preview, skip the verification loop, and write source directly. That
would make the distinction meaningless.

By keeping MCP read-only, the MVP enforces that every source change goes through
an explicit, verifiable path:

1. The agent reads context through MCP.
2. The agent writes source through its own file-writing mechanism.
3. The agent runs the build and verifies through HMR.
4. The verification result is readable through MCP (read-only).

The MCP server is a read view over daemon state. The daemon is the source of
truth. The MCP server holds no write path.

---

## Transports

The MCP server serves two transports, both loopback-only and both read-only
(ADR-013):

- **stdio** - `startStdioTransport` uses `StdioServerTransport`. The standard
  transport for local agent integration. Spawn the `vision-control-mcp` binary
  as a child process and communicate via JSON-RPC over stdin/stdout.
- **loopback HTTP/WS** - `startHttpTransport` uses
  `StreamableHTTPServerTransport` and binds to `127.0.0.1` only (never
  `0.0.0.0` or a public interface). Every request passes through `checkAuth`
  (Bearer token plus origin allowlist) before the transport sees it. The CLI
  and `vision-control doctor` reach it at `VC_MCP_URL` with `VC_MCP_TOKEN`.

The read-only tool contract (ADR-010) is unchanged by transport. No tool on
either transport writes source, applies patches, or mutates state. Binding the
HTTP transport to a non-loopback interface requires a future ADR; there is no
flag or env var that silently widens the bind.

---

## V1: deterministic patch suggestions

Deterministic patch suggestions are a V1 feature (PRD section 7.2, line 298).
They are returned as inert data (a `suggestedDiff` payload with diff text, source
ranges, confidence, and preconditions), not applied through a tool. The agent
reads the suggestion, decides whether to apply it, and applies it through its own
file-writing mechanism. The MCP server never writes. See ADR-012.

---

## Rules for agents

- **Do not add a write tool to the MCP server.** If a task seems to require one,
  raise it. The answer is almost certainly that the agent should write source
  through its own mechanism and verify through HMR, not through MCP.
- **Do not add a tool that mutates the change journal.** The journal is
  append-only from the extension side.
- **Do not add a tool that bypasses redaction.** Context exports go through the
  redaction layer (ADR-009). There is no unredacted export path.
- **Do not bind the MCP transport to a non-loopback interface.** Both stdio and
  loopback HTTP bind locally only. Non-loopback HTTP requires a future ADR that
  approves a transport and threat model (ADR-013; PRD open question 7, line 2698).
