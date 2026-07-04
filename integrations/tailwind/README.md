# @vision-control/tailwind

Tailwind token-aware source adapter: resolves `className` utilities (v3 config
**and** v4 CSS-first `@theme`) to source origins with nearest-token
suggestions. Implements the `SourceAdapter` contract from
`@vision-control/source-resolver` via a local structural mirror (D15 — this
package does NOT import source-resolver, to avoid a cyclic workspace edge).

> Nx tags: `platform:node`, `type:integration`, `scope:tailwind`.

## V1 status (shipped)

- **Tailwind v3** — config-backed token registry (`buildTokenRegistry`) parses
  a resolved `tailwind.config` object into spacing / color / fontSize /
  fontFamily tokens, with the default scale baked in. The adapter
  (`createTailwindTokenAdapter`) resolves className utilities against it and
  cites AST origins for HIGH confidence.
- **Tailwind v4** — CSS-first `@theme { --*: ...; }` parser
  (`parseThemeTokens` / `createTailwindV4ThemeRegistry`) walks the consumer's
  CSS entry with PostCSS and maps v4 namespaces to `TokenCategory`. The adapter
  (`createTailwindTokenAdapter({ v4ThemeRegistry })`) consults the v4 registry
  as a fallback when the v3 config registry misses, so v4 custom tokens
  (`bg-brand` → `--color-brand`) resolve. The daemon `source-pipeline.ts`
  auto-detects v3 vs v4 (config file XOR `@theme` in CSS). A registry-only
  candidate never reaches HIGH — `enforceNeverWrongHigh` caps it at MEDIUM.

## v4 `@theme` namespace mapping

Only the four namespaces the narrow `TokenCategory` models are emitted; every
other v4 namespace is skipped rather than guessed into `unknown` (those tokens
reach the unified registry via plain CSS custom-property extraction).

| `@theme` namespace | `TokenCategory` |
|---|---|
| `--color-*`     | `color`      |
| `--spacing-*`   | `spacing` (with `px`) |
| `--font-*`      | `fontFamily` |
| `--text-*`      | `fontSize`   |
| `--font-weight-*` | skipped (recognised; fontWeight not in the narrow set; matched before `--font-*`) |
| `--radius-*`, `--shadow-*`, `--leading-*`, ... | skipped |

```ts
import { createTailwindV4ThemeRegistry } from "@vision-control/tailwind";

const registry = createTailwindV4ThemeRegistry(`
  @theme {
    --color-brand: oklch(0.5 0.2 250);
    --spacing-2: 0.5rem;
    --font-sans: Inter, system-ui, sans-serif;
  }
`);

registry.resolveThemeVariable("color-brand"); // { key:"brand", category:"color", value:"oklch(...)" }
registry.resolveThemeVariable("--spacing-2"); // { key:"2", category:"spacing", value:"0.5rem", px:8 }
registry.listThemeVariables();                // all parsed tokens
```

The registry emits **data only** — value + category, never confidence/evidence.
never-wrong-HIGH is the resolver's job (a registry token is not HIGH evidence
on its own).

### Adapter wiring (task 12)

Pass a `v4ThemeRegistry` to `createTailwindTokenAdapter` so v4 CSS-first tokens
resolve. The daemon `source-pipeline.ts` builds the registry automatically when
it detects a v4 workspace (no `tailwind.config.*` + `@theme` in CSS).

```ts
import { createTailwindTokenAdapter, createTailwindV4ThemeRegistry } from "@vision-control/tailwind";

const adapter = createTailwindTokenAdapter({
  v4ThemeRegistry: createTailwindV4ThemeRegistry(css),
  sourceFiles,
});
// bg-brand resolves to --color-brand; gap-2 resolves via v3 default scale.
// A registry-only candidate (no AST origin) stays MEDIUM, never HIGH.
```

v4 utility renames handled: opacity modifier syntax (`bg-brand/50`), gradient
color stops (`from-brand`/`via-brand`/`to-brand`), `text-*` overload
(color vs fontSize via namespace priority).

Out of scope: v4 dynamic spacing scale (`--spacing` base multiplier synthesis)
— only explicit `@theme` declarations are parsed. Shadow/radius/leading
namespaces are skipped (not in the narrow `TokenCategory` set).

## Public API

| Export | Purpose |
|---|---|
| `createTailwindTokenAdapter`, `TAILWIND_TOKEN_ADAPTER` | v3/v4 source adapter (`v4ThemeRegistry?` option) |
| `buildTokenRegistry`, `registerTailwindTokens` | v3 token registry |
| `createTailwindV4ThemeRegistry`, `NOOP_V4_THEME_REGISTRY` | v4 `@theme` registry |
| `parseThemeTokens`, `THEME_NAMESPACE_RULES` | v4 parser primitives |
| `parseClassName`, `findClassNameOrigins`, ... | class-token tooling |

## Scripts

Run from the repository root:

```bash
pnpm nx run tailwind:build        # tsc -p tsconfig.build.json -> dist/
pnpm nx run tailwind:typecheck    # tsc --noEmit -p tsconfig.json
pnpm nx run tailwind:test         # vitest run
```
