# ADR-014: Direct codemod outside MCP

## Status

Accepted (2026-07-03). Extends [ADR-010](./ADR-010-readonly-mcp.md) and
[ADR-012](./ADR-012-deterministic-patch-suggestions.md) to the V2 codemod path.
**Product CLI codemod path superseded (2026-07-15)** by the extension-SoT /
MCP-bridge pivot ([ADR-019](./ADR-019-extension-source-of-truth.md),
[ADR-020](./ADR-020-mcp-bridge-projection.md)).

**Superseded for product CLI:** `vision-control codemod preview|apply` as a
shipped product command. The product CLI surface becomes MCP launcher only
(ADR-020 C2).

**Retained:**

- Codemod / patch apply is **never** an MCP tool (ADR-010).
- Agents apply patches through their own file-writing tools, then verify after
  HMR.
- Inert `suggestedDiff` data may still exist (ADR-012); application stays
  outside MCP.

## Context

The PRD lists "optional direct codemod" as a V2 feature (PRD section 7.3, line
309) and leaves "direct codemod in V1?" as an open question (section 40, line
2695). The approved V1/V2 plan resolved this: codemod is a V2 capability track,
implemented as an explicit local action, never as an MCP tool.

The risk is that a codemod path becomes a hidden source-write through MCP. PRD
Appendix D constraint 10 (line 2905) requires that after an agent changes source
it must provide a runtime verification loop. A codemod that applied through MCP
would bypass both the read-only contract (ADR-010) and the verification loop.

The extension-SoT pivot drops the fat product CLI (including codemod commands).
Agent file tools replace the CLI codemod path. The load-bearing guardrail from
[AGENTS.md](../../AGENTS.md) remains: **Do not add source-mutating MCP tools.**
See [mcp-policy.md](../agents/mcp-policy.md).

## Decision

Direct codemod / patch apply is an explicit local agent (or human) action,
performed outside the MCP server. It is **not** a product CLI command under the
extension-SoT pivot.

- **Agent file tools.** The agent reads context (panel export or MCP projection),
  writes source through its ordinary file-writing path, and runs verification.
  There is no MCP apply tool and no required `vision-control codemod` product
  command.
- **Historical CLI path (v0.2.0).** A CLI codemod that showed a diff and required
  `--confirm` existed outside MCP. That product CLI path is dropped; the
  "outside MCP" rule remains.
- **Mandatory verification.** After writing, the agent must run the
  source-after-HMR verification loop (PRD Appendix D constraint 10, line 2905).
  A dry run is never final evidence.
- **MCP stays read-only.** The MCP tool list contains no apply, write, patch, or
  codemod tool. The forbidden-tool guard in the test suite asserts this.

## Consequences

- An agent that wants automated application uses its own file tools, sees the
  diff in its workflow, and verifies. It cannot apply through MCP.
- The MCP read-only contract (ADR-010) is unaffected.
- Product CLI no longer ships codemod commands (ADR-020). Users who never pair
  an agent still edit in the panel without any CLI codemod.

## MVP Guardrail

This ADR protects against source-mutating MCP tools. The extension-SoT pivot
removes the product CLI codemod surface but does **not** move apply into MCP.
No source-mutating MCP tool exists. Patch application stays an explicit local
agent/human action with a mandatory verification loop.
