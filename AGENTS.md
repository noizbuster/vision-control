<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# Vision Control

## Purpose

Vision Control turns visual editing of a live web page into structured
source-change intent. A Chromium DevTools panel lets you pick an element,
inspect it, and issue edit commands. The runtime previews edits in the browser.
The **extension is the source of truth** for selection, preview, and the tab
journal. An **optional** single-process MCP bridge gives a coding agent a
projection of that state so it can understand the page and verify its work.

The runtime preview is not a source change. That distinction is the backbone of
every guardrail below.

Architecture contracts: [ADR-019](./docs/adr/ADR-019-extension-source-of-truth.md)
(extension SoT), [ADR-020](./docs/adr/ADR-020-mcp-bridge-projection.md) (MCP
bridge). Full product scope history: [Vision-Control-PRD.md](./Vision-Control-PRD.md).

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Root scripts (`check`, `typecheck`, `test`, `build`, `boundaries`) and engines |
| `pnpm-workspace.yaml` | Workspace globs + shared dependency catalog |
| `nx.json` | Nx monorepo task wiring |
| `biome.json` | Sole formatter/linter (ADR-001) — no ESLint/Prettier/Stylelint |
| `tsconfig.base.json` | Shared TypeScript strict baseline (ADR-002) |
| `playwright.config.ts` | Root Playwright config for e2e |
| `CONTRIBUTING.md` | Human contributor setup and conventional-commit scopes |
| `DESIGN.md` | Product/UI decision source of truth |
| `Vision-Control-PRD.md` | Full product requirements and constraints |
| `README.md` / `README.ko.md` | Human-facing project overview |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `apps/` | Product app (extension) and fixture apps (see `apps/AGENTS.md`) |
| `packages/` | Shared libraries by platform tag (see `packages/AGENTS.md`) |
| `integrations/` | Agent/editor MCP adapters (see `integrations/AGENTS.md`) |
| `tools/` | Nx plugin, generators, boundary checker (see `tools/AGENTS.md`) |
| `docs/` | ADRs, agent policy docs, schemas (see `docs/AGENTS.md`) |
| `scripts/` | Root one-off scripts (see `scripts/AGENTS.md`) |
| `.github/` | CI workflows (see `.github/AGENTS.md`) |

Residual delete-disposition trees may still exist on disk as `dist/`/`node_modules`
only (`apps/daemon`, several former packages/integrations per
[docs/c7-package-inventory.md](./docs/c7-package-inventory.md)). Do not revive them
as product paths.

## Package boundaries

The workspace has packages split across `apps/`, `packages/`, `integrations/`,
and `tools/`. Every package carries Nx tags in its `project.json` that declare
its platform and type:

- `platform:browser` - runs in the extension or page context
- `platform:node` - runs in the MCP server or CLI
- `platform:isomorphic` - runs anywhere
- `type:library`, `type:app`, `type:integration`, `type:fixture`

Two rules are enforced by the boundary checker:

1. A `platform:node` package must not import a `platform:browser` package.
2. No package may deep-import another package's `src/` directory. Use the
   package public API (`@vision-control/<name>`) only.

Run `pnpm boundaries` to check. The checker scans every `.ts` and `.tsx` file
under each package's `src/`.

Full rules and examples: [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md).

## For AI Agents

### Working In This Directory

- Read this file before writing any code. Human contributors use
  [CONTRIBUTING.md](./CONTRIBUTING.md) instead.
- Prefer package-local `AGENTS.md` briefs under `apps/`, `packages/`, etc. for
  area-specific contracts.
- Read relevant ADRs under [docs/adr/](./docs/adr/) before changing architecture.
  If a change contradicts an ADR, raise it — do not silently override.
- Export public APIs from each package's `src/index.ts` only. No `any` in public
  signatures.
- Write evidence under `.omo/evidence/task-<N>-*.md` for plan tasks. Capture real
  command output, not summaries.
- Follow conventional commits with scopes listed in CONTRIBUTING.md.

### MUST do

- Run `pnpm check`, `pnpm typecheck`, and `pnpm test` before claiming a task is
  done. `pnpm build` too if you changed compilable code.
- Read ADR-019/020 first for SoT and MCP shape.
- Add types for every public API.
- Keep Biome as the only formatter/linter.

### MUST NOT do

These are hard guardrails. Violating them breaks the project contract.

- **Do not add source-mutating MCP tools.** The MCP server exposes read-only
  tools and coordination signals only. There is no `vision_apply_deterministic_patch`
  and there will not be one. See
  [docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md) and ADR-010/020.
- **Do not treat the daemon as the source of truth.** The extension owns
  edit/journal state (ADR-019). MCP is an optional projection (ADR-020). There
  is no always-on daemon product path for ordinary editing.
- **Do not require MCP or a Node process for the edit loop.** Select, preview,
  undo/redo, and panel context export work while agent-disconnected.
- **Do not inject source markers into production builds.** Markers are a
  dev-only build artifact when present. They must never ship to a production
  bundle. Marker HIGH is not a product path under ADR-019. See ADR-008 and
  [docs/agents/security-privacy.md](./docs/agents/security-privacy.md).
- **Do not require `chrome.debugger`.** The extension works without the debugger
  permission. It is optional, not mandatory.
- **Do not implement features still deferred past the current pivot.** The
  following remain **forbidden** until their ADR gate is satisfied:
  - **Firefox browser-driven parity** beyond the manifest-validated matrix
    (ADR-016). The Chromium (MV3) build is the primary target.
  - **Remote real-time collaboration**: no relay, cloud sync, or transport
    (ADR-018). Local panel export is the share path (ADR-015 supersession).
  - **A source-mutating MCP tool.** Patch apply is an agent file-tool action;
    it must never become an MCP tool. Product CLI codemod is dropped (ADR-014
    supersession).
  - **Mandatory `chrome.debugger`.** It stays `optional_permissions`.
  - **Non-loopback MCP bind** or multi-port scan product path (ADR-020).
  - **Workspace index / component-props AST / marker HIGH** as product paths
    (ADR-019 regression ledger).
- **Do not treat runtime preview mutation as a source change.** Visual edits
  live in the preview layer until an agent or human applies a real patch.
- **Do not auto-convert normal-flow drag to absolute positioning.** This is PRD
  constraint 2.
- **Do not add a second formatter or linter.** Biome is the only one. No ESLint,
  no Prettier, no Stylelint. See ADR-001.
- **Do not break package boundaries.** Browser packages must not depend on Node
  packages and vice versa. No deep imports into `src/`. Extension must not import
  `platform:node` source packages.
- **Do not use `--dry-run` output as verification evidence.** Run the real
  command and capture real output. See
  [docs/agents/verification.md](./docs/agents/verification.md).
- **Do not pass preview-cleared checks off as source verification.** A preview
  that renders correctly does not prove the source changed. The verification
  loop must assert on the actual source after HMR. Unpaired MCP must never
  return stale `passed: true` (ADR-019 C6).
- **Do not put pair secrets on MCP stdout or in `/discover`.** Pair token on
  stderr / panel paste only (ADR-020 C3).

### Testing Requirements

Before declaring a task complete, run and capture real output:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm boundaries
```

If the change touches e2e, also run `pnpm test:e2e`.

### Common Patterns

- Workspace packages use Nx tags + public barrel `src/index.ts`.
- Catalog protocol in `pnpm-workspace.yaml` for shared external versions.
- Evidence files under `.omo/evidence/` with real command output.
- Hierarchical `AGENTS.md` files: each non-root file has
  `<!-- Parent: ../AGENTS.md -->`.

## Where to find things

| Need | Look at |
|---|---|
| Product scope and architecture | [Vision-Control-PRD.md](./Vision-Control-PRD.md) |
| Extension SoT + MCP bridge contracts | [ADR-019](./docs/adr/ADR-019-extension-source-of-truth.md), [ADR-020](./docs/adr/ADR-020-mcp-bridge-projection.md) |
| Architecture decisions | [docs/adr/](./docs/adr/) |
| Package boundary rules | [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md) |
| Security and privacy contract | [docs/agents/security-privacy.md](./docs/agents/security-privacy.md) |
| Verification and evidence rules | [docs/agents/verification.md](./docs/agents/verification.md) |
| MCP read-only policy | [docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md) |
| Development setup and commits | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Root scripts | [package.json](./package.json) |
| Keep/delete package inventory | [docs/c7-package-inventory.md](./docs/c7-package-inventory.md) |

## Dependencies

### Internal

- Workspace packages under `apps/`, `packages/`, `integrations/`, `tools/` via
  `@vision-control/*` public APIs only.

### External

- pnpm 11 + Node >= 22, Nx, Biome, TypeScript, Vitest, Playwright, WXT, React 19,
  Zod — versions pinned in `pnpm-workspace.yaml` catalog.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
