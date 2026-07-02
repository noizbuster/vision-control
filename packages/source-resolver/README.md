# @vision-control/source-resolver

Resolves a selection identity to a source candidate using source markers, CSS
class-token origins, and low-confidence fallback. Priority: source marker
(high) → stale/ambiguous (medium) → static CSS class (medium) → fallback (low).

> Nx tags: platform:node, type:library, scope:source-resolver.

## Scripts

Run from the repository root:

```bash
pnpm build        # tsc -p tsconfig.build.json -> dist/
pnpm typecheck    # tsc --noEmit -p tsconfig.json
pnpm test         # vitest run
```
