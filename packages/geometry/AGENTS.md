<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# geometry

## Purpose

Isomorphic geometry primitives: points, rects, matrices, coordinate conversion, scroll parents, geometry snapshots. DOM-free.

Package: `@vision-control/geometry` · Nx project typically `geometry`.

## Key Files

| File | Description |
|------|-------------|
| `src/point.ts` | Point math |
| `src/rect.ts` | Rect math |
| `src/matrix.ts` | Matrix transforms |
| `src/coordinate-conversion.ts` | Coordinate space conversion |
| `src/geometry-snapshot.ts` | GeometrySnapshot schema |
| `src/scroll-parents.ts` | Scroll offset accumulation |
| `src/dom-free.test.ts` | DOM-free guard |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/__fixtures__/` | Fixtures |

## For AI Agents

### Working In This Directory

- Keep pure functions; no layout thrashing APIs.
- Snapshots are serializable facts for IR/verify.

### Testing Requirements

```bash
pnpm nx run geometry:typecheck
pnpm nx run geometry:test
pnpm nx run geometry:build
```

index + dom-free tests.

### Common Patterns

- Schema-validated snapshots.
- Explicit scroll-parent lists instead of live walks here.

### Anti-Patterns

- No getBoundingClientRect inside this package.

## Dependencies

### Internal

- @vision-control/element-identity

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
