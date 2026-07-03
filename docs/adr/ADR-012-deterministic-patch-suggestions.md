# ADR-012: Deterministic patch suggestions as inert data

## Status

Accepted (2026-07-03). Reinforces [ADR-010](./ADR-010-readonly-mcp.md); does
not revise or weaken it.

## Context

The PRD lists "deterministic patch suggestions" as a V1 feature (PRD section
7.2, line 298) and states the deterministic-first principle (PRD P7, lines
139-141): static class replacement and unambiguous CSS declaration changes are
deterministic patch candidates; dynamic cases are left to agent reasoning. The
PRD also restates that the human controls when context is shared or source is
changed (PRD P8, line 143).

ADR-010 made the MCP server strictly read-only and declared that
`vision_apply_deterministic_patch` does not exist and will not exist in the MVP.
The V1 work adds the suggestion generation itself (plan todo 14). The risk this
ADR guards against is that "suggestion" drifts into "application": a tool that
writes the suggested patch through MCP, which would collapse the
preview-to-source distinction and skip the mandatory verification loop (PRD
Appendix D constraint 10, line 2905).

The load-bearing guardrail from [AGENTS.md](../../AGENTS.md): **Do not add
source-mutating MCP tools.** See
[mcp-policy.md](../agents/mcp-policy.md) for the full tool policy.

## Decision

Deterministic patch suggestions are inert data. They are computed for safe
static edits (token replacement, CSS declaration or class replacement, CSS
Modules local class declaration edit, inline style object literal edit, static
JSX text edit, unambiguous reorder) and returned through the context compiler
and the MCP server as data only.

- **No apply tool.** There is no `vision_apply_deterministic_patch` tool and
  there will not be one in the MVP or V1 scope. The MCP server returns a
  `suggestedDiff` (or equivalent) payload containing diff text, source ranges,
  confidence, and preconditions. It does not write it.
- **Data, not action.** The agent reads the suggestion, decides whether to apply
  it, and applies it through its own file-writing mechanism, then runs the
  verification loop. The MCP server holds no write path (ADR-010 unchanged).
- **Confidence-bound.** Dynamic or ambiguous edits (`props.className`, computed
  class expressions, ambiguous CSS rules) do not produce a deterministic
  suggestion; they return an agent-required signal with no patch.
- **Reinforces ADR-010.** This ADR extends the read-only contract to the
  suggestion surface. It does not open any path that ADR-010 closed.

## Consequences

- The MCP tool surface stays small, read-only, and auditable. Every tool is a
  read; suggestions are data inside a read response.
- An agent cannot skip the verification loop through MCP. To change source it
  must write the file itself, rebuild, and verify through HMR (PRD Appendix D
  constraint 10, line 2905).
- Deterministic suggestions are safe to surface to UI and context because they
  carry preconditions and confidence, and they cannot mutate state on their own.
- Optional V2 direct codemod, if implemented, stays outside MCP as an explicit
  local action (ADR-014).

## MVP Guardrail

This ADR protects the V1 deterministic-patch feature (PRD 7.2, line 298) from
silently becoming a source-mutating MCP tool. It restates the AGENTS.md
guardrail verbatim: there is no source-mutating MCP tool, and there will not be
one. The absence of `vision_apply_deterministic_patch` is reinforced, not
relaxed, by the arrival of suggestion data. This keeps the preview-to-source
distinction (PRD Appendix D constraint 1, line 2896) intact: a suggestion is a
candidate, never an applied change.
