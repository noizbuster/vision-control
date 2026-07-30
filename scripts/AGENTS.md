<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# scripts

## Purpose

Root-level one-off Node scripts invoked by package.json scripts. Not a workspace
package — keep this directory thin.

## Key Files

| File | Description |
|------|-------------|
| `package-extension.mjs` | Packages the built extension artifact (`pnpm package:extension`) |

## Subdirectories

_None._

## For AI Agents

### Working In This Directory

- Prefer `packages/*` libraries for reusable logic; scripts are glue only.
- Use plain Node ESM (`.mjs`) consistent with root `"type": "module"`.

### Testing Requirements

- Exercise via the root script that calls the file (e.g. `pnpm package:extension`)
  after `pnpm nx run extension:build`.

### Common Patterns

- No TypeScript compile step; keep scripts small and dependency-free when possible.

## Dependencies

### Internal

- Reads extension build output under `apps/extension/.output/` (or equivalent).

### External

- Node built-ins.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
