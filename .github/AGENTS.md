<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# .github

## Purpose

GitHub Actions CI and repository automation.

## Key Files

| File | Description |
|------|-------------|
| _(see workflows/)_ | Workflow definitions |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `workflows/` | CI pipeline definitions (see `workflows/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- CI must exercise real `pnpm check`, `typecheck`, `test`, `build`, `boundaries` —
  not `--dry-run` stand-ins.
- Keep secrets out of logs; pair tokens never on MCP stdout.

### Testing Requirements

- Validate workflow changes by reading the YAML and ensuring script names match
  root `package.json`. Prefer a dry PR for runner validation.

### Common Patterns

- pnpm via `packageManager` field; Node >= 22.

## Dependencies

### Internal

- Root package scripts and Nx targets.

### External

- GitHub Actions marketplace actions as pinned in workflow files.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
