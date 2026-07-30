<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# docs

## Purpose

Architecture decisions, agent policy contracts, release notes, and machine-readable
schemas. ADRs are binding; agent policy docs under `agents/` are the operational
interpretation of those ADRs for coding agents.

## Key Files

| File | Description |
|------|-------------|
| `c7-package-inventory.md` | ADR-019 C7 keep/delete inventory (authoritative dispositions) |
| `feature-matrix.md` | Feature coverage matrix |
| `known-limitations.md` | Documented gaps and OUT rationales |
| `mcp-config-examples.md` | Sample MCP client configs |
| `migration-v0.1.0-to-v0.2.0.md` | Version migration notes |
| `release-notes-v0.1.0.md` / `release-notes-v0.2.0.md` | Release notes |
| `security-privacy-overview.md` | Human-oriented security overview |
| `troubleshooting.md` | Common failure modes |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `adr/` | Architecture Decision Records ADR-001..020 (see `adr/AGENTS.md`) |
| `agents/` | Agent-facing policy: boundaries, MCP, security, verification (see `agents/AGENTS.md`) |
| `json-schemas/` | Published JSON schemas (see `json-schemas/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Before architectural changes, read the relevant ADR. Contradictions need an
  explicit ADR update or plan amendment — never silent override.
- Prefer linking ADRs from package `AGENTS.md` files over duplicating policy.
- Keep `known-limitations.md` honest when e2e remains fixme/OUT.

### Testing Requirements

- Docs freshness is guarded in `@vision-control/testing` (`docs-freshness.test.ts`).
- No build step; review links and cross-references manually when editing.

### Common Patterns

- ADR filenames: `ADR-NNN-kebab-title.md` with status + context + decision.
- Agent policy docs are concise contracts, not tutorials.

## Dependencies

### Internal

- Referenced heavily from root and package `AGENTS.md` files.

### External

- None.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
