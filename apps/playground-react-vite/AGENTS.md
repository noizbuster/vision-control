<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# playground-react-vite

## Purpose

Primary adversarial React + Vite + Tailwind fixture (`@vision-control/playground-react-vite`).
Used by root `pnpm dev` alongside the extension. Hosts hostile DOM cases: iframes,
shadow DOM, portals, identical buttons, CSS modules, grid, flex resize, HMR demo, etc.

## Key Files

| File | Description |
|------|-------------|
| `index.html` | Vite HTML entry |
| `vite.config.ts` | Vite config |
| `src/main.tsx` | App bootstrap |
| `src/App.tsx` | Fixture router/board |
| `playwright.config.ts` | Fixture e2e config |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | App source (see `src/AGENTS.md`) |
| `src/fixtures/` | Individual adversarial cases (see `src/fixtures/AGENTS.md`) |
| `e2e/` | Fixture health + HMR demo specs |
| `public/` | Static assets (e.g. iframe-content.html) |

## For AI Agents

### Working In This Directory

- Keep cases adversarial and minimal — each fixture should stress one behavior.
- Do not soften tests to make the extension look greener.
- Not a product UI; avoid polish-driven refactors.

### Testing Requirements

```bash
pnpm nx run playground-react-vite:test
pnpm nx run playground-react-vite:e2e
```

### Common Patterns

- Named fixture components under `src/fixtures/`.
- Tailwind + CSS modules coexistence cases.

## Dependencies

### Internal

- None required for the fixture itself; extension loads against it in browser.

### External

- React, Vite, Tailwind, Playwright, Vitest.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
