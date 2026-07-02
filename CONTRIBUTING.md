# Contributing to Vision Control

Thanks for contributing. This guide covers development setup, commit
conventions, how to add a package, the testing strategy, and the PR checklist.

---

## Development setup

Requirements: Node 22 or newer. pnpm is managed through Corepack so every
contributor runs the same version (11.9.0, pinned in `package.json#packageManager`).

```bash
corepack enable
pnpm install --frozen-lockfile
```

If Corepack is missing (Node 26 does not bundle it), install it first:

```bash
npm install -g corepack
corepack enable
```

### Daily commands

| Command | What it does |
|---|---|
| `pnpm check` | Biome lint and format check across the repo |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | `vitest run` in every package |
| `pnpm build` | `tsc -p tsconfig.build.json` in every package |
| `pnpm test:e2e` | Playwright end-to-end suite |
| `pnpm affected` | Run typecheck, test, and build only for changed packages |
| `pnpm graph` | Open the Nx dependency graph in a browser |
| `pnpm boundaries` | Run the package boundary checker |
| `pnpm doctor` | Print the Nx environment report |
| `pnpm nx show projects` | List all workspace projects |

### Formatting

Biome is the only formatter and linter. Do not add ESLint, Prettier, or any
other tool. To auto-fix formatting:

```bash
pnpm format
```

Markdown files are excluded from Biome. Write clean markdown by hand.

---

## Commit conventions

This project follows [Conventional Commits 1.0](https://www.conventionalcommits.org/).
Every commit message starts with a type and an optional scope:

```
<type>(<scope>): <subject>
```

### Types

`build`, `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `perf`, `ci`

### Scopes

Use the scope that matches the area of change. Common scopes:

- `foundation` - root toolchain, workspace config, scripts
- `protocol` - `packages/protocol` message and schema work
- `extension` - `apps/extension` the Chromium extension
- `daemon` - `apps/daemon` and `packages/daemon-*`
- `inspector` - `packages/inspector-core`, `packages/element-identity`
- `editor` - `packages/editor-core`, `packages/interaction-machine`
- `layout` - `packages/layout-engine`, `packages/geometry`
- `vite-react` - `integrations/vite-react` source marker plugin
- `context` - `packages/context-compiler`, context export
- `mcp` - `packages/mcp-server`
- `verification` - `packages/verification-engine`
- `e2e` - end-to-end test infrastructure
- `generators` - `tools/nx-plugin` scaffolding and boundaries

### Examples

```
build(foundation): pin pnpm and catalog versions
feat(editor): add text edit command
fix(protocol): narrow change schema union
test(verification): add HMR re-identification test
docs(architecture): record mvp decisions and quick start
```

### Commit size

Keep commits small. One logical change per commit. Do not mix foundation work,
schema changes, runtime logic, UI, and tests into a single commit. See PRD
section 35.4.

---

## Branch workflow

1. Branch from `master`.
2. Name branches `vc-<task-id>-<short-description>` (for example
   `vc-mvp-05-protocol-schema`).
3. Rebase onto `master` before opening a PR.
4. Squash or rebase so the PR history reads cleanly.

---

## Adding a new package

Packages are generated from a manifest so the file set stays consistent. Do not
copy and paste an existing package by hand.

1. Add an entry to the manifest in
   `tools/nx-plugin/src/scripts/scaffold-all.ts`.
2. Run the generator:

   ```bash
   pnpm nx run tools-nx-plugin:scaffold
   ```

3. The generator writes the full skeleton: `package.json`, `project.json` (with
   Nx tags and build/typecheck/test targets), `tsconfig.json`,
   `tsconfig.build.json`, `vitest.config.ts`, `src/index.ts`, and a trivial
   test. It is idempotent, so re-running it overwrites cleanly.
4. If the package needs different platform tags (for example
   `platform:browser` instead of `platform:isomorphic`), edit `project.json#tags`
   after scaffolding. The boundary checker reads tags from there.

The generator is a pure function that returns a file plan, then writes it. There
is no `@nx/devkit` dependency. See ADR-003 and
[docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md) for the
boundary rules.

---

## Package boundary rules

Every package declares platform and type tags in `project.json`. The boundary
checker enforces two rules:

1. `platform:node` packages must not import `platform:browser` packages.
2. No deep imports into `@vision-control/<name>/src/`. Use the public package
   export only.

Run `pnpm boundaries` before pushing. Browser-only packages include
`overlay-ui`, `inspector-core`, `editor-core`, and `preview-engine`. Node-only
packages include `workspace-index`, `daemon-core`, `storage`, `mcp-server`, and
`cli`.

Full rules: [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md).

---

## Testing strategy

The project uses hybrid TDD (ADR-004). Some areas are TDD-first, others are
test-after.

**TDD-first** (write the failing test, then the code):

- `packages/protocol` - schemas and message types
- `packages/change-ir` - change representation
- `packages/element-identity` - stable addressing
- `packages/security` - auth and redaction
- `integrations/vite-react` - source marker plugin

**Test-after** (write the feature, then pin it with tests):

- `packages/overlay-ui` - overlay rendering glue
- `apps/extension` - DevTools panel wiring
- Other UI integration layers

Run the full unit suite with `pnpm test`. Run end-to-end tests with
`pnpm test:e2e`.

Full strategy: [docs/agents/verification.md](./docs/agents/verification.md).

---

## Evidence convention

Every plan task produces an evidence file at
`.omo/evidence/task-<N>-vision-control-mvp.md`. The file must contain:

- Timestamp and environment
- Files created or modified
- Full output of every verification command (not summaries)
- Any negative tests you ran

Do not use `--dry-run` output as evidence. Run the real command. Do not pass a
preview-cleared check off as source verification. See
[docs/agents/verification.md](./docs/agents/verification.md) and ADR-005.

---

## PR checklist

Before opening a PR, confirm every item:

- [ ] `pnpm check` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes (if you changed compilable code)
- [ ] `pnpm boundaries` passes
- [ ] No `any` in public API signatures
- [ ] No deep imports into another package's `src/`
- [ ] No V1 or V2 features implemented beyond stubs
- [ ] No source-mutating MCP tools added
- [ ] No production source markers injected
- [ ] Evidence file written under `.omo/evidence/` (if this is a plan task)
- [ ] Commit messages follow conventional commits with the right scope
- [ ] README or relevant docs updated if behavior changed
