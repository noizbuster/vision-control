# ADR-020: MCP bridge projection and single-process dual transport

## Status

Accepted (2026-07-15). Companion to
[ADR-019](./ADR-019-extension-source-of-truth.md). Supersedes the
daemon-as-extension-backend and MCP-reads-daemon-state claims in
[ADR-007](./ADR-007-loopback-daemon.md) and the "daemon remains the source of
truth" clause in [ADR-010](./ADR-010-readonly-mcp.md). Restates and owns the
loopback-only + no non-loopback expansion rules previously split across ADR-007
and [ADR-013](./ADR-013-mcp-loopback-http-policy.md). Does not weaken the
read-only MCP contract (ADR-010).

## Context

Under the v0.2.0 model, the MCP server was a read view over daemon state. The
daemon served the extension; MCP served agents; both were always-on for a full
agent loop. ADR-019 moves SoT into the extension. MCP must become an **optional
projection and command bridge**, not a second source of truth and not a second
process with its own cache of inventable selection state.

Risks this ADR closes:

- Two MCP processes with two caches (stale or conflicting agent views).
- Discover endpoints that leak pair secrets.
- Pair material on stdout (corrupts agent MCP JSON-RPC).
- Non-loopback bind or wide local port scan.
- Shared auth domain between agent Bearer token and extension pair token.
- Fat product CLI that reintroduces daemon/workspace commands.
- Stale verification `passed: true` when unpaired.

Contracts C2, C3, and C5 are locked here. C6 (verify home) and C8 (SW reconnect)
are owned by ADR-019 but constrain MCP projection behavior.

## Decision

### MCP is optional projection, not SoT

- The extension pushes snapshots and receives coordination commands.
- MCP holds a **projection cache** of the last ingested extension snapshot and
  verification results. It does not invent selection or journal state.
- When unpaired, tools return `not_paired` / empty / error. Never stale success
  for verification.
- Read-only tool contract (ADR-010) still holds: no source write, no journal
  mutation from MCP, no apply-patch tool.

### C2 - Single MCP process, dual transport

One process (`packages/mcp-server` binary) serves both:

1. **stdio** → coding agent (MCP JSON-RPC).
2. **loopback HTTP discovery**: `GET http://127.0.0.1:4322/discover` only.
   Fixed port **4322**. If busy, fail with a clear error. No multi-port scan as
   a product path.
3. **loopback WebSocket** pair + bridge on the same port 4322
   (for example `ws://127.0.0.1:4322/bridge` with token via query or header).

Rules:

- Agent Bearer token (`VC_MCP_TOKEN`) **≠** extension pair token. Separate
  secrets (ADR-013 spirit).
- Forbid a second MCP instance as a product path.
- CLI `vision-control mcp` spawns **this** binary only. Product CLI surface is
  the MCP launcher (plus help). Daemon/status/sessions/context/changes/verify/
  preview/share/codemod product commands leave the CLI path (see ADR-014 and
  ADR-015 supersession notes).

### C3 - Pair / auto-detect / token bootstrap

- **Auto-detect** = probe `http://127.0.0.1:4322/discover` only. No secret in
  the response.
- Discover JSON shape (no token field):

```json
{
  "host": "127.0.0.1",
  "port": 4322,
  "wsPath": "/bridge",
  "pairTokenRequired": true,
  "protocolVersion": "<semver>"
}
```

- Pair token appears **once** on MCP process **stderr** (pairing line / URL)
  and/or user paste into the panel. **Stdout is reserved for agent MCP
  JSON-RPC.** Pair material on stdout is forbidden.
- Extension completes WebSocket pair with the token. Reject missing, wrong, or
  expired tokens.
- Token TTL: **5 minutes** from mint. Reconnect with the same token until
  expiry; on expiry, re-pair (new token from stderr pairing line).
- Persist in `chrome.storage.local`: **endpoint only** (`127.0.0.1:4322` +
  paths). Do **not** persist the raw pair token long-term. On SW wake, reconnect
  if the token is still in memory; else prompt re-pair.
- Refuse non-loopback hosts. Content script **never** opens the MCP socket
  (background only).

### C5 - Slim MCP tool names (exact)

Keep (read / coordination only):

1. `vision_get_active_session`
2. `vision_get_selection`
3. `vision_get_changeset`
4. `vision_get_source_context` (compiled snapshot; name kept for agent configs;
   data is the extension snapshot)
5. `vision_get_verification_plan` (last plan/result projection; may be empty)
6. `vision_clear_preview`
7. `vision_request_verification`
8. `vision_mark_patch_started`
9. `vision_mark_patch_completed`

**Drop** from the product tool list: `vision_capture_element`,
`vision_get_diagnostics` (prefer absent from `TOOL_NAMES`, not empty stubs).

Coordination tools enqueue commands for the extension. They do not write source
and do not mutate the journal from the MCP side.

### Loopback-only (retained and restated)

Moved here from the product-path claims of ADR-007; aligned with ADR-013:

- Bind discovery and bridge to `127.0.0.1` only. Never `0.0.0.0` or a public
  interface.
- **No non-loopback expansion without a future ADR.** No flag, env var, or
  config silently widens the bind.
- Separate agent Bearer token and extension pair token.
- No raw pair token, MCP token, or session secret in discover JSON, context
  snapshots, or share/export payloads (ADR-009).

### Command queue and snapshot push

- Extension → MCP: snapshot push (selection, changeset, context, verification
  result) with monotonic `snapshotRev` per tab.
- MCP → extension: command enqueue / ack for clear preview, request
  verification, and patch markers.
- Heartbeat: max gap 15 s without `session.heartbeat` → disconnected (C8).

## Consequences

- Agents get live context only when the user starts one MCP process and pairs
  the extension. Editing never depends on that process.
- One process, one projection cache: no dual-MCP product path.
- Discover is safe to probe from the extension without leaking secrets.
- Stdout stays clean for agent JSON-RPC; operators read pair material from
  stderr.
- Product CLI shrinks to MCP launcher. Codemod and share leave the CLI; agents
  use file tools; panel keeps local export.
- ADR-013's loopback HTTP policy remains valid; this ADR owns the bridge
  product shape (fixed 4322, discover, pair WS, dual transport in one process).

## MVP Guardrail

This ADR protects against dual SoT via MCP, secret leakage on discover/stdout,
non-loopback exposure, and fat CLI reintroduction. It enforces:

- Single MCP process dual transport on loopback port 4322 (C2).
- Discover without secrets; pair token on stderr only; 5-minute TTL (C3).
- Separate agent vs pair tokens.
- Exact slim tool list of nine names; no capture/diagnostics; no source write
  (C5 + ADR-010).
- No non-loopback bind without a future ADR.
- Unpaired tools never return stale verification pass (C6).

It deliberately excludes always-on daemon backend, workspace index, MCP source
mutation, extension-as-TCP-server, and multi-port scan product paths.
