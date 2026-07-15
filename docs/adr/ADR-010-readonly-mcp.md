# ADR-010: Read-only MCP and no source mutation

## Status

Accepted (2026-07-02). **SoT clause superseded (2026-07-15)** by
[ADR-019](./ADR-019-extension-source-of-truth.md) and
[ADR-020](./ADR-020-mcp-bridge-projection.md). The **read-only MCP contract is
unchanged and remains in force**.

**Superseded claim:** "The daemon remains the source of truth for page and
workspace state. The MCP server is a read view over it."

**Current SoT:** the extension owns edit/journal state (ADR-019). MCP is an
optional projection and command bridge over extension-pushed snapshots
(ADR-020). Slim tool names: ADR-020 C5.

## Context

The MCP server (`packages/mcp-server`) gives a coding agent context about the
page. An agent that can read this context is valuable. An agent that can write
through the MCP server is dangerous: it could bypass the preview-to-source
verification loop and silently rewrite source files.

The PRD (section 7.1, line 282) lists "MCP read-only tools" as an MVP feature.
The PRD (section 7.2, line 298) lists "deterministic patch suggestions" as a V1
feature. The core constraint (Appendix D constraint 10, line 2905) requires that
after an agent changes source, it must provide a runtime verification loop.

## Decision

The MCP server exposes read-only tools and coordination signals only. There is
no `vision_apply_deterministic_patch` tool and there will not be one in the MVP
or later product path without a new ADR that reopens write tools (it must not).

Allowed categories (read / coordination; exact names in ADR-020 C5):

- Session / selection / changeset projection from the extension snapshot
- Source context: compiled extension snapshot (map origins when present;
  redacted per ADR-009)
- Verification plan/result projection (may be empty; never stale pass when
  unpaired)
- Coordination: clear preview, request verification, patch started/completed
  markers (command queue to extension; no source write)

Explicitly absent:

- `vision_apply_deterministic_patch` - does not exist. Patch application is the
  agent's job, done through its own file-writing mechanism, outside the MCP
  server.
- Any tool that writes to source, or mutates the change journal from the MCP
  side. The journal is owned by the extension (ADR-019 C1); MCP projects it.
- `vision_capture_element` and `vision_get_diagnostics` leave the product tool
  list (ADR-020 C5).

The separation is architectural: the MCP server projects extension-pushed state.
It does not hold a source write path. If patch suggestions ship, they are data
(a suggested diff string), not applied through a tool (ADR-012).

## Consequences

- An agent using the MCP server cannot write source through it. To change source,
  the agent must use its own file-writing capability, run the build, and verify
  through HMR. This keeps the verification loop mandatory.
- The tool surface is small and auditable (nine tools under ADR-020 C5).
- Deterministic patch suggestions remain inert data (ADR-012), not MCP actions.
- The **extension** is the source of truth for page edit state (ADR-019). MCP is
  an optional read/coordination view over extension snapshots (ADR-020).

## MVP Guardrail

This is the most important scope decision for agent integration. Allowing source
mutation through MCP would make the preview-to-source distinction meaningless: an
agent could skip the preview, skip the verification loop, and write source
directly. By making MCP strictly read-only (plus coordination that never writes
source), the product enforces that every source change goes through an explicit,
verifiable path. The absence of `vision_apply_deterministic_patch` is not a
missing feature. It is a deliberate guardrail. See
[docs/agents/mcp-policy.md](../agents/mcp-policy.md) and ADR-020 for the tool
list and bridge policy.
