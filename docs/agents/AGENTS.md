<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# agents

## Purpose

Operational policy docs for AI coding agents. These are the concise contracts
behind root `AGENTS.md` MUST/MUST NOT rules.

## Key Files

| File | Description |
|------|-------------|
| `package-boundaries.md` | Platform tags, import rules, examples |
| `mcp-policy.md` | Read-only MCP tool policy |
| `security-privacy.md` | Security/privacy contract |
| `verification.md` | Verification + evidence rules |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Update these when ADRs change policy; keep root `AGENTS.md` in sync.
- Do not dilute MCP read-only language.

### Testing Requirements

- `packages/testing` docs-freshness tests may assert these files exist.

### Common Patterns

- Short normative language; link ADRs for rationale.

## Dependencies

### Internal

- ADRs under `docs/adr/`.

### External

- None.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
