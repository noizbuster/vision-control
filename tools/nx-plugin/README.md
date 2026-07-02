# @vision-control/nx-plugin

Local Nx plugin for Vision Control. Owns two responsibilities:

1. **Package-skeleton generators** that produce identical, consistent project
   metadata (`package.json`, `project.json`, `tsconfig.json`,
   `tsconfig.build.json`, `vitest.config.ts`, `README.md`, `src/index.ts`,
   `src/index.test.ts`) for every workspace package.
2. **Workspace boundary conformance** that fails the build when a `platform:node`
   package imports a `platform:browser` package, or when any source file
   deep-imports another package's `src/*`.

## Why no `@nx/devkit` Tree?

The generators are **devkit-independent pure functions**
(`src/core/generate-package-files.ts`): `(options) -> GeneratedFile[]`. This keeps
scaffolding reproducible and unit-testable without a workspace Tree, and avoids a
hard dependency on `@nx/devkit` (not installed in this workspace). The same core
drives every generator and the bulk scaffold target.

## Targets

```bash
pnpm nx run tools-nx-plugin:build        # tsc -p tsconfig.build.json -> dist/
pnpm nx run tools-nx-plugin:typecheck    # tsc --noEmit
pnpm nx run tools-nx-plugin:test         # vitest run (generator + boundary unit tests)
pnpm nx run tools-nx-plugin:scaffold     # (re)generate all 28 package skeletons
pnpm nx run tools-nx-plugin:boundaries   # run the boundary conformance check
```

`scaffold` runs the compiled `dist/scripts/scaffold-all.js` (so it `dependsOn: build`).
`boundaries` runs `src/scripts/boundaries.ts` directly under Node's native
TypeScript stripping (it has no internal imports).

The boundary check is also exposed as the root script `pnpm boundaries`, which
makes it compose with `nx affected`.

## Generators

| Generator | Default tags | Used for |
| --- | --- | --- |
| `vision-package` | `platform:isomorphic`, `type:library` | Isomorphic libraries (`protocol`, `geometry`, ...) |
| `browser-package` | `platform:browser`, `type:library`/`app` | Browser libs + `apps/extension` |
| `node-package` | `platform:node`, `type:library`/`app` | `packages/cli`, `apps/daemon` |
| `integration-package` | `platform:node`, `type:integration` | `integrations/vite-react` |
| `fixture-app` | `platform:browser`, `type:fixture` | `apps/playground-react-vite` |

See `src/generators/README.md` for the per-generator schema and the canonical
invocation. The single declarative source of which packages exist is the manifest
in `src/scripts/scaffold-all.ts`; add a line there and re-run `scaffold` to
introduce a new package with guaranteed-consistent metadata.

## Boundary rules (PRD 20.3, 35.2)

1. A `platform:node` package MUST NOT import a `platform:browser` package.
2. No source file may deep-import another workspace package's `src/*`
   (e.g. `@vision-control/protocol/src/internal`).

Rules are tag-driven: the checker reads each package's `project.json#tags`, so
re-tagging a package changes enforcement with no code change.
