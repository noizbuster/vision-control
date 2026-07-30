<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# editor-core

## Purpose

Browser-tagged library for edit command helpers and multi-select model (bounding rect, group constraints). DOM-free logic despite platform:browser tag for consumer graph placement.

Package: `@vision-control/editor-core` · Nx project typically `editor-core`.

## Key Files

| File | Description |
|------|-------------|
| `src/index.ts` | Re-exports multi-select |
| `src/dom-free.test.ts` | DOM-free guard |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/multi-select/` | Multi-select model (see `src/multi-select/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Keep multi-select pure; DOM binding lives in extension/overlay-ui.
- Group constraints must respect layout-engine D41 semantics when composing moves.

### Testing Requirements

```bash
pnpm nx run editor-core:typecheck
pnpm nx run editor-core:test
pnpm nx run editor-core:build
```

dom-free + multi-select model tests.

### Common Patterns

- Barrel re-exports subdirectory only.

### Anti-Patterns

- No direct DOM APIs.
- No Node imports.

## Dependencies

### Internal

- @vision-control/element-identity
- @vision-control/geometry

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
