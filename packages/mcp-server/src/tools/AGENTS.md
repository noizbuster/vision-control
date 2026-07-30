<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# tools

## Purpose

Read-only MCP tools and coordination signals: get selection/changeset/source context/verification plan/active session; clear preview; mark patch started/completed; request verification.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | registerAllTools + TOOL_NAMES |
| `get-selection.ts` | get selection |
| `get-changeset.ts` | get changeset |
| `get-source-context.ts` | compiled context |
| `get-verification-plan.ts` | verification plan |
| `get-active-session.ts` | active session |
| `clear-preview.ts` | clear preview signal |
| `mark-patch-started.ts` | coordination |
| `mark-patch-completed.ts` | coordination |
| `request-verification.ts` | request verify |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- NO source-mutating tool — ever.
- Redact tool outputs (query strings, secrets).
- Unpaired: never stale passed:true.

### Testing Requirements

tools-c5 and tool-output redaction tests.

### Common Patterns

- Match neighboring file style.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
