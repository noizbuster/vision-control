<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# interaction-machine

## Purpose

Isomorphic, DOM-free pointer/gesture state machine: states, events, drag threshold, pointer ownership, multi-select/group-move transitions, reorder/reparent/resize operation helpers.

Package: `@vision-control/interaction-machine` · Nx project typically `interaction-machine`.

## Key Files

| File | Description |
|------|-------------|
| `src/machine.ts` | State machine |
| `src/states.ts` | State defs |
| `src/events.ts` | Event defs |
| `src/machine-types.ts` | Shared types |
| `src/drag-threshold.ts` | Drag threshold policy |
| `src/pointer-ownership.ts` | Pointer ownership |
| `src/multi-select-transitions.ts` | Multi-select transitions |
| `src/group-move-transitions.ts` | Group-move transitions |
| `src/dom-free.test.ts` | DOM-free guard |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/handlers/` | State handlers (see `src/handlers/AGENTS.md`) |
| `src/operations/` | Reorder/reparent/resize ops (see `src/operations/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Machine is pure; extension controllers bind pointer events and call transitions.
- Respect D41: no absolute-position collapse for normal flow.
- Pointer ownership prevents gesture fights.

### Testing Requirements

```bash
pnpm nx run interaction-machine:typecheck
pnpm nx run interaction-machine:test
pnpm nx run interaction-machine:build
```

machine, transitions, operations, dom-free tests.

### Common Patterns

- Explicit transition tables.
- Operation modules return IR intents, not DOM writes.

### Anti-Patterns

- No DOM listeners inside this package.
- No preview mutation here.

## Dependencies

### Internal

- change-ir
- editor-core
- element-identity
- geometry
- layout-engine

### External

- zod

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
