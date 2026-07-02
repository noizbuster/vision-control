# ADR-010: Read-only MCP and no source mutation

## Status

Accepted (2026-07-02).

## Context

The MCP server (`packages/mcp-server`) gives a coding agent context about the
page and the workspace. An agent that can read this context is valuable. An agent
that can write through the MCP server is dangerous: it could bypass the
preview-to-source verification loop and silently rewrite source files.

The PRD (section 7.1, line 282) lists "MCP read-only tools" as an MVP feature.
The PRD (section 7.2, line 298) lists "deterministic patch suggestions" as a V1
feature. The core constraint (Appendix D constraint 10, line 2905) requires that
after an agent changes source, it must provide a runtime verification loop.

## Decision

The MCP server exposes read-only tools only. There is no
`vision_apply_deterministic_patch` tool and there will not be one in the MVP.

Allowed tools (read-only):

- Page inspection: element tree, computed styles, box model, class list
- Source context: source marker resolution, file index queries
- Context export: JSON and Markdown context (redacted per ADR-009)
- Change journal: read the current preview state and history
- Verification status: read the result of the last HMR assertion

Explicitly absent:

- `vision_apply_deterministic_patch` - does not exist. Patch application is the
  agent's job, done through its own file-writing mechanism, outside the MCP
  server.
- Any tool that writes to source, modifies the preview state machine, or mutates
  the change journal. The journal is append-only from the extension side; the MCP
  server reads it.

The separation is architectural: the MCP server reads daemon state. It does not
hold a write path. If a future version adds patch suggestions (V1), they would be
returned as data (a suggested diff string), not applied through a tool.

## Consequences

- An agent using the MCP server cannot write source through it. To change source,
  the agent must use its own file-writing capability, run the build, and verify
  through HMR. This keeps the verification loop mandatory.
- The tool surface is small and auditable. Every tool is a read; there are no
  side effects to reason about.
- Deterministic patch suggestions are deferred to V1. When they arrive, they are
  data, not actions.
- The daemon remains the source of truth for page and workspace state. The MCP
  server is a read view over it.

## MVP Guardrail

This is the most important scope decision in the MVP. Allowing source mutation
through MCP would make the preview-to-source distinction meaningless: an agent
could skip the preview, skip the verification loop, and write source directly.
By making MCP strictly read-only, the MVP enforces the contract that every source
change goes through an explicit, verifiable path. The absence of
`vision_apply_deterministic_patch` is not a missing feature. It is a deliberate
guardrail. See [docs/agents/mcp-policy.md](../agents/mcp-policy.md) for the full
tool list and policy.
