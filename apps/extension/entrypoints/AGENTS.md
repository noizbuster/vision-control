<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# entrypoints

## Purpose

WXT filename-discovered extension contexts. Do not manually register; file name defines the context.

## Key Files

| File | Description |
|------|-------------|
| `background.ts` | Service worker entry: router, journal authority, bridge pairing |
| `content.ts` | Isolated-world content script entry |
| `devtools/main.ts` | DevTools panel registration |
| `panel/main.tsx` | React panel mount |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `devtools/` | DevTools page entry |
| `panel/` | Panel page entry + HTML shell |

## For AI Agents

### Working In This Directory

- One MessageBus per context.
- Background owns journal writes and message routing.
- Content hosts overlay and interaction controllers.
- Do not edit generated `.wxt/`.

### Testing Requirements

`pnpm nx run extension:build` exercises entrypoint bundling; unit tests cover wiring modules under `src/`.

### Common Patterns

- WXT entry default exports.
- Thin entry files that import `src/*` implementations.

## Dependencies

### Internal

- See parent package.

### External

- See parent package.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
