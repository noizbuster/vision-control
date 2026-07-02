# MCP Read-Only Policy

This guide defines the MCP server's tool policy for the Vision Control MVP. The
MCP server exposes read-only tools only. There is no source mutation path through
MCP.

Related: [ADR-010](../adr/ADR-010-readonly-mcp.md),
[security-privacy.md](./security-privacy.md).

---

## Core rule

The MCP server (`packages/mcp-server`) gives a coding agent read access to page
state and workspace context. It does not give the agent a way to write source,
modify the preview state machine, or mutate the change journal.

There is no `vision_apply_deterministic_patch` tool. There will not be one in the
MVP.

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

## V1: deterministic patch suggestions

Deterministic patch suggestions are a V1 feature (PRD section 7.2, line 298).
When they arrive, they will be returned as data (a suggested diff string), not
applied through a tool. The agent reads the suggestion, decides whether to apply
it, and applies it through its own file-writing mechanism. The MCP server never
writes.

---

## Rules for agents

- **Do not add a write tool to the MCP server.** If a task seems to require one,
  raise it. The answer is almost certainly that the agent should write source
  through its own mechanism and verify through HMR, not through MCP.
- **Do not add a tool that mutates the change journal.** The journal is
  append-only from the extension side.
- **Do not add a tool that bypasses redaction.** Context exports go through the
  redaction layer (ADR-009). There is no unredacted export path.
- **Do not add HTTP transport for MCP in the MVP.** The MVP uses stdio. HTTP
  transport is deferred (PRD open question 7, line 2698).
