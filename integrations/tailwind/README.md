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
  CSS entry with PostCSS and maps v4 namespaces to `TokenCategory`. v4 is now a
  supported target (was a documented V2 seam; V1-shipped as of task 11).

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

Out of scope here (tracked separately): v4 dynamic spacing scale
(`--spacing` base multiplier synthesis) and adapter wiring
(`v4ThemeRegistry?` option on `createTailwindTokenAdapter`) — task 12.

## Public API

| Export | Purpose |
|---|---|
| `createTailwindTokenAdapter`, `TAILWIND_TOKEN_ADAPTER` | v3 source adapter |
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
