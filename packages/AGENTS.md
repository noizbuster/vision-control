<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# packages

## Purpose

Shared libraries that implement the edit loop, IR, preview, verification, MCP
bridge, and supporting primitives. Every package is tagged with `platform:*` and
`type:library` in `project.json`. Public API is `src/index.ts` only; consumers
import `@vision-control/<name>` — never deep `src/` paths.

## Key Files

| File | Description |
|------|-------------|
| _(per-package)_ | Each package has `package.json`, `project.json`, `tsconfig*.json`, `vitest.config.ts`, `src/index.ts` |

## Subdirectories

### Product path (Keep)

| Directory | Platform | Purpose |
|-----------|----------|---------|
| `bridge-client/` | isomorphic | Extension client for optional MCP bridge (discover/pair/heartbeat) |
| `change-ir/` | isomorphic | Change operation IR, inverse, merge, serialization |
| `change-journal/` | isomorphic | Undo/redo journal over change-ir |
| `cli/` | node | Product CLI — MCP launcher only (ADR-020) |
| `context-compiler/` | isomorphic | Redacted, token-budgeted agent context compiler |
| `editor-core/` | browser | Multi-select model and edit command helpers |
| `element-identity/` | isomorphic | ElementRef, fingerprints, selection identity |
| `geometry/` | isomorphic | Points, rects, matrices, geometry snapshots |
| `inspector-core/` | browser | Selection summaries, inspector commands, box model |
| `interaction-machine/` | isomorphic | Pointer/gesture state machine (DOM-free) |
| `layout-engine/` | isomorphic | Semantic layout intents (drag/resize/align/grid) |
| `logger/` | isomorphic | Structured + redacting logger |
| `map-origins/` | isomorphic | CSS/JS source-map origin resolution (ADR-019 C4 caps) |
| `mcp-server/` | node | Read-only MCP + loopback bridge :4322 |
| `overlay-ui/` | browser | Page overlay primitives (handles, guides, hit-testing) |
| `preview-engine/` | isomorphic | Reversible runtime preview (not source truth) |
| `protocol/` | isomorphic | Versioned envelopes and message contracts |
| `security/` | isomorphic | Redaction, pairing tokens, allowlists, share bundles |
| `shared-ui/` | browser | Shared panel UI primitives (minimal barrel today) |
| `testing/` | isomorphic | Vitest preset, Playwright loader, evidence helpers |
| `verification-engine/` | isomorphic | HMR assertion engine (final read-only gate) |

### Residual delete-disposition (do not revive)

Per [docs/c7-package-inventory.md](../docs/c7-package-inventory.md):
`daemon-client`, `daemon-core`, `storage`, `source-registry`, `source-resolver`,
`workspace-index` may remain as `dist/`/`node_modules` husks only.

## For AI Agents

### Working In This Directory

- Check `project.json` tags before adding imports across packages.
- New packages: use `@vision-control/nx-plugin` generators under `tools/nx-plugin`.
- Keep DOM access behind explicit `dom-adapter.ts` modules where that pattern exists.
- DOM-free packages (`layout-engine`, `geometry`, `element-identity`,
  `interaction-machine`, `editor-core`) guard the invariant with `dom-free.test.ts`.
- Prefer structural typing over hard edges for optional cross-package seams
  (e.g. verification-engine's `PreviewClearer`).

### Testing Requirements

```bash
pnpm nx run <pkg>:typecheck
pnpm nx run <pkg>:test
pnpm nx run <pkg>:build
pnpm boundaries
```

### Common Patterns

- `PACKAGE_NAME` const exported from barrels.
- Zod schemas colocated with types.
- Append-only subdirectory barrels re-exported from root `index.ts`.

## Dependencies

### Internal

- Leaf → mid → app layering. `change-ir` / `protocol` / `security` / `element-identity`
  / `geometry` are foundational. Browser packages must not be imported by
  `platform:node`.

### External

- `zod` widely; `ws` + `@modelcontextprotocol/sdk` in mcp-server; others minimal.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
