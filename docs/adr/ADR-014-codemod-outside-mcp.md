# ADR-014: Direct codemod outside MCP

## Status

Accepted (2026-07-03). Extends [ADR-010](./ADR-010-readonly-mcp.md) and
[ADR-012](./ADR-012-deterministic-patch-suggestions.md) to the V2 codemod path.

## Context

The PRD lists "optional direct codemod" as a V2 feature (PRD section 7.3, line
309) and leaves "direct codemod in V1?" as an open question (section 40, line
2695). The approved V1/V2 plan resolves this: codemod is a V2 capability track,
implemented as an explicit local action, never as an MCP tool.

The risk is that a codemod path becomes a hidden source-write through MCP. PRD
Appendix D constraint 10 (line 2905) requires that after an agent changes source
it must provide a runtime verification loop. A codemod that applied through MCP
would bypass both the read-only contract (ADR-010) and the verification loop.

The load-bearing guardrail from [AGENTS.md](../../AGENTS.md): **Do not add
source-mutating MCP tools.** See [mcp-policy.md](../agents/mcp-policy.md).

## Decision

V2 direct codemod is an explicit local CLI or agent action, performed outside
the MCP server.

- **Explicit local action.** The codemod runs through a CLI command (or an
  agent-consumable patch flow) that reads a deterministic patch suggestion
  (ADR-012), shows the diff and its preconditions, and requires an explicit
  confirmation flag before writing. There is no implicit or background apply.
- **Normal file-writing path.** The codemod writes source through the ordinary
  file-writing path. It does not get a special write channel, and it never
  routes through MCP.
- **Mandatory verification.** After writing, the codemod always runs the
  source-after-HMR verification loop (PRD Appendix D constraint 10, line 2905).
  A dry run is allowed as a preview but is never accepted as final evidence.
- **MCP stays read-only.** The MCP tool list contains no apply, write, patch, or
  codemod tool. The forbidden-tool guard in the test suite asserts this.

## Consequences

- An agent that wants automated application uses the local codemod flow, sees the
  diff, confirms, and verifies. It cannot apply through MCP.
- The MCP read-only contract (ADR-010) is unaffected. The suggestion data
  (ADR-012) feeds the codemod; the codemod consumes it locally.
- The codemod is opt-in and explicit, so a user who never invokes it is never
  subject to automatic source mutation.

## MVP Guardrail

This ADR protects the V2 direct-codemod feature (PRD 7.3, line 309) from
becoming a source-mutating MCP tool. It restates the AGENTS.md guardrail: no
source-mutating MCP tool exists, and the codemod stays an explicit local action
with a confirmation flag and a mandatory verification loop. It deliberately
keeps the codemod off the MCP surface so the read-only contract cannot be
weakened by adding a "convenience" apply tool.
