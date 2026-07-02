# @vision-control/protocol-placeholder

Placeholder library so the monorepo toolchain (`pnpm build | typecheck | test`)
has a real Nx project to run against.

This package is intentionally minimal and will be removed or formalized once the
custom Nx generator (a later task) scaffolds the real `protocol` package.

## Scripts

Run from the repository root:

```bash
pnpm build        # tsc emit -> dist/
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
```
