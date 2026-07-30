<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# apps

## Purpose

Runnable applications and fixtures. The only product app is the Chromium
extension (`extension`). Other entries are adversarial fixtures and labs used
to exercise the extension and verification loop. The former `daemon` app is
delete-disposition (ADR-019 C7) and must not return as a product path.

## Key Files

| File | Description |
|------|-------------|
| _(none at this level)_ | Each app owns its own `package.json` / `project.json` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `extension/` | Product DevTools extension — SoT for selection/preview/journal (see `extension/AGENTS.md`) |
| `playground-react-vite/` | Primary adversarial React+Vite+Tailwind fixture for local dev + e2e |
| `playground-next/` | Next.js fixture for dev-only source-marker negative tests |
| `visual-regression-lab/` | Overlay screenshot/baseline lab fixture |
| `daemon/` | **Residual delete-disposition only** — do not revive (ADR-019 C7) |

## For AI Agents

### Working In This Directory

- Prefer `pnpm nx run <app>:<target>` from repo root.
- Root `pnpm dev` runs `extension` + `playground-react-vite` only — never the daemon.
- Fixtures are not product surface; keep them hostile and coverage-oriented.
- Extension is `platform:browser` / `type:app`. Fixtures are `type:fixture`.

### Testing Requirements

- App unit: `pnpm nx run <app>:test`
- Extension e2e: `pnpm nx run extension:e2e` (needs `pnpm playwright install chromium`)
- Fixture e2e where present: `pnpm nx run playground-react-vite:e2e`, etc.

### Common Patterns

- WXT entrypoints under `extension/entrypoints/` (filename-discovered).
- Playwright specs colocated in each app's `e2e/`.

## Dependencies

### Internal

- Extension consumes many `@vision-control/*` browser/isomorphic libraries.
- Fixtures should stay dependency-light and not import Node platform packages.

### External

- WXT, React, Vite, Next, Playwright — see each app `package.json`.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
