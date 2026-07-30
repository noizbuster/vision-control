<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# workflows

## Purpose

GitHub Actions workflow definitions for CI.

## Key Files

| File | Description |
|------|-------------|
| `ci.yml` | Primary CI pipeline (install, check, typecheck, test, build, boundaries) |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Keep job steps aligned with root scripts in `package.json`.
- Use frozen lockfile installs in CI.
- Do not weaken boundary or typecheck gates.

### Testing Requirements

- YAML validity + script name parity with root package.json.

### Common Patterns

- pnpm/action-setup + Node 22.

## Dependencies

### Internal

- Root Nx/pnpm scripts.

### External

- GitHub-hosted runners + Actions.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
