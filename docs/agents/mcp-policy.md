# MCP Read-Only Policy

This guide defines the MCP server's tool policy for Vision Control. The MCP
server exposes read-only tools and coordination signals only. There is no source
mutation path through MCP.

Related: [ADR-010](../adr/ADR-010-readonly-mcp.md),
[ADR-012](../adr/ADR-012-deterministic-patch-suggestions.md),
[ADR-013](../adr/ADR-013-mcp-loopback-http-policy.md),
[ADR-019](../adr/ADR-019-extension-source-of-truth.md),
[ADR-020](../adr/ADR-020-mcp-bridge-projection.md),
[security-privacy.md](./security-privacy.md).

---

## Core rule

The MCP server (`packages/mcp-server`) is an **optional** bridge. It gives a
coding agent a projection of extension-owned page state and a command queue for
coordination (clear preview, request verification, patch markers). It does not
give the agent a way to write source, dual-write the change journal, or invent
selection state.

There is no source-mutating MCP tool. There is no
`vision_apply_deterministic_patch` tool and there will not be one in the MVP or
later product path. Deterministic patch suggestions (when present) are returned
as inert `suggestedDiff` data, never applied through a tool (ADR-012).

**Source of truth:** the browser extension owns edit state and the tab journal
(ADR-019). MCP holds a projection cache of extension-pushed snapshots. MCP is
not the source of truth. There is no always-on daemon product path for editing.

---

## Allowed tools (slim set, ADR-020 C5)

Exact product tool names (nine). Prefer absent from `TOOL_NAMES` over empty
stubs for dropped tools.

**Read / projection**

1. `vision_get_active_session`
2. `vision_get_selection`
3. `vision_get_changeset`
4. `vision_get_source_context` (compiled extension snapshot; origins may be empty)
5. `vision_get_verification_plan` (last plan/result projection; may be empty)

**Coordination (command queue to extension; no source write)**

6. `vision_clear_preview`
7. `vision_request_verification`
8. `vision_mark_patch_started`
9. `vision_mark_patch_completed`

**Dropped from the product tool list**

- `vision_capture_element`
- `vision_get_diagnostics`

When unpaired, tools return `not_paired` / empty / error. Verification tools
must **never** return a stale `passed: true` (ADR-019 C6).

Every tool is a read or a coordination signal. None of them write source files.

---

## Explicitly absent tools

These tools do not exist in the MCP server and must not be added:

- `vision_apply_deterministic_patch` (or any name that applies a source patch)
- Any tool that writes to source files
- Any tool that dual-writes or mutates the change journal from the MCP side
- Any tool that triggers a build or restart as a hidden side effect of "apply"

---

## Why read-only

The preview-to-source distinction is the core contract of Vision Control (PRD
Appendix D constraint 1). Visual edits live in the preview layer until an agent or
human applies a real patch. If the MCP server could apply patches, an agent could
skip the preview, skip the verification loop, and write source directly. That
would make the distinction meaningless.

By keeping MCP read-only (plus coordination that never writes source), the
product enforces that every source change goes through an explicit, verifiable
path:

1. The agent reads context through MCP (or panel export).
2. The agent writes source through its own file-writing mechanism.
3. The agent runs the build and verifies through HMR (content-owned verify).
4. The verification result is readable through MCP when paired (projection only).

The MCP server is a projection over extension-pushed state. The extension is the
source of truth. The MCP server holds no source write path.

---

## Transports (single process, ADR-020 C2/C3)

One MCP process serves two loopback-safe surfaces (ADR-013, ADR-020):

- **stdio** - coding agent MCP JSON-RPC. Stdout is reserved for JSON-RPC. Pair
  material must never appear on stdout.
- **loopback discovery + WebSocket bridge** - fixed port `127.0.0.1:4322`.
  - `GET http://127.0.0.1:4322/discover` returns host/port/wsPath/protocolVersion
    and `pairTokenRequired` only. **No token field.**
  - WebSocket pair+bridge on the same port. Extension is the client (background
    only; content script never opens the MCP socket).
  - If port 4322 is busy, fail with a clear error. No multi-port scan product
    path.

Auth:

- Agent Bearer token (`VC_MCP_TOKEN`) is separate from the extension pair token.
- Pair token is printed once on process **stderr** (and/or pasted into the panel).
  TTL 5 minutes from mint.
- Persist endpoint only in extension storage; do not persist the raw pair token
  long-term.
- Refuse non-loopback. Binding to a non-loopback interface requires a future ADR.

CLI product surface: `vision-control mcp` spawns this binary only. No second MCP
instance as a product path.

The read-only tool contract (ADR-010) is unchanged by transport. No tool on
either surface writes source or applies patches.

---

## Regression ledger (MCP-related)

| v0.2.0 | Pivot |
|---|---|
| Always-on daemon as SoT; MCP reads daemon | Extension SoT; MCP optional projection (ADR-019/020) |
| 11 tools including capture/diagnostics | 9 slim tools (C5); drop capture and diagnostics |
| Fat CLI (context/verify/share/codemod/...) | CLI = MCP launcher only |
| Dual process / dual cache risk | Single MCP process, one projection cache |

---

## V1: deterministic patch suggestions

Deterministic patch suggestions are inert data (a `suggestedDiff` payload with
diff text, source ranges, confidence, and preconditions), not applied through a
tool. The agent reads the suggestion, decides whether to apply it, and applies it
through its own file-writing mechanism. The MCP server never writes. See ADR-012.

---

## Rules for agents

- **Do not add a write tool to the MCP server.** If a task seems to require one,
  raise it. The answer is almost certainly that the agent should write source
  through its own mechanism and verify through HMR, not through MCP.
- **Do not treat MCP as the source of truth.** The extension owns the journal and
  edit state (ADR-019). MCP projects what the extension pushes.
- **Do not add a tool that mutates the change journal from MCP.** Journal writes
  are background-owned in the extension (ADR-019 C1).
- **Do not add a tool that bypasses redaction.** Context exports go through the
  redaction layer (ADR-009). There is no unredacted export path.
- **Do not bind the MCP transport to a non-loopback interface.** Discovery and
  bridge bind to `127.0.0.1` only. Non-loopback requires a future ADR (ADR-013,
  ADR-020).
- **Do not put pair secrets on stdout or in `/discover`.** Stderr and panel paste
  only (ADR-020 C3).
- **Do not require an always-on daemon for editing.** Editing works unpaired.
