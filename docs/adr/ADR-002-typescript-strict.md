# ADR-002: TypeScript strict mode with bundler module resolution

## Status

Accepted (2026-07-02).

## Context

Vision Control packages are consumed by bundlers: the Chromium extension is
built by WXT (which wraps Vite), the playgrounds use Vite, and the source marker
integrations are Vite and Next plugins. The shared base tsconfig must type-check
under bundler resolution semantics.

Some packages may later run directly under Node (the daemon, the CLI). Node's
native TypeScript stripping (Node 22+) has stricter requirements: relative
imports must use explicit file extensions, and `moduleResolution: nodenext`
expects `.js` extensions that map to `.ts` source files.

The PRD (section 35.2, lines 2504-2513) requires strict typing, no `any` in
public signatures, and browser globals behind adapter interfaces.

## Decision

The shared base tsconfig (`tsconfig.base.json`) uses:

- `module: "ESNext"` with `moduleResolution: "bundler"` (decision D2)
- `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`,
  `noUnusedLocals`, `noUnusedParameters`
- `isolatedModules: true` and `verbatimModuleSyntax: true` so every package is
  bundler-safe and tool-friendly
- Relative imports written with explicit `.js` extensions (`./index.js` mapping
  to `index.ts`) so the same source type-checks under `nodenext` later

A Node-only package that must run directly under Node CJS overrides to
`moduleResolution: "nodenext"` in its own `tsconfig.json`. The base stays
bundler because that is the majority consumer.

## Consequences

- Type imports must use `import type` explicitly (`verbatimModuleSyntax`). This
  is a minor adjustment but prevents accidental runtime side effects from
  type-only imports.
- `exactOptionalPropertyTypes` is stricter than plain `strict`. An optional
  property set to `undefined` is not the same as omitting it. Code must respect
  the distinction.
- `noUncheckedIndexedAccess` means `array[i]` has type `T | undefined`, not `T`.
  This catches off-by-one errors at compile time but requires null checks on
  indexed access.
- Node 26 native TS stripping uses `.ts` extensions for relative imports, which
  conflicts with the `.js` convention. Standalone scripts that run under stripping
  use `.ts` imports; compiled scripts run from `dist/` with `.js` imports. The
  boundary checker and scaffold script follow this split (see learnings, task 2).

## MVP Guardrail

Strict typing with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
catches the null-deref and optional-property bugs that would otherwise surface as
runtime preview glitches or daemon crashes. `verbatimModuleSyntax` keeps packages
bundler-clean so the WXT extension and Vite integrations compile without
surprises. These flags are deliberately stricter than `"strict": true` alone,
because the MVP scope includes element identity, change IR, and source resolution
where a type error is a correctness bug.
