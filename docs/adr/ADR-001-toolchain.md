# ADR-001: pnpm + Nx + Biome toolchain

## Status

Accepted (2026-07-02). Supersedes any informal toolchain discussion in the PRD.

## Context

Vision Control is a 29-package monorepo spanning browser code (Chromium
extension, content scripts, Shadow DOM overlay), Node code (loopback daemon, MCP
server, CLI), and isomorphic libraries (protocol, IR, geometry). The toolchain
needs to handle workspace linking, project-graph task orchestration, caching,
and code quality from a single root.

The PRD (section 20.1, lines 1369-1478) mandates pnpm workspaces for package
linking and Nx for task orchestration. It also mandates Biome as the only
formatter and linter (Appendix D constraint 9, line 2904).

Alternative orchestrators considered:

- **Turborepo**: good caching but weaker project-graph tooling and no native
  generator story. The project needs a custom package generator and a boundary
  checker wired into the task graph, both of which Nx handles natively.
- **Lerna**: largely deprecated. nx owns the monorepo task space now.
- **Bare pnpm scripts**: no caching, no affected detection, no project graph.

Alternative linters considered:

- **ESLint + Prettier**: two tools, two configs, plugin sprawl. Biome does both
  in one binary with a single config file and sub-10ms full-repo checks.

## Decision

Use pnpm 11.9.0 (pinned via `packageManager`, activated through Corepack 0.35.0)
for workspace linking and dependency ownership. Use Nx 23.0.1 for project-graph
task orchestration, caching, affected detection, and the dependency graph. Use
Biome 2.5.2 as the single formatter and linter.

Root scripts call Biome directly (`pnpm check`, `pnpm lint`) rather than wrapping
it in per-project Nx targets, because Biome already scans the whole repo from one
root config. The `affected` target lists only `typecheck`, `test`, and `build`.
See decisions D1, D4 in `.omo/notepads/vision-control-mvp/decisions.md`.

Per-package devDependencies are required (no shameful hoisting). Root declares
only `nx` and `@biomejs/biome`. Every package declares its own `typescript`,
`vitest`, and `@types/node` through the `catalog:` protocol. This preserves pnpm's
isolated `node_modules`, which is the substrate for package-boundary discipline.

## Consequences

- Every contributor runs the same pnpm version via Corepack. Node 26 no longer
  bundles Corepack, so `npm install -g corepack` is a prerequisite.
- Biome formats and lints JSON too (`package.json`, `nx.json`, `tsconfig*.json`,
  `biome.json`). Markdown is excluded.
- The package generator must emit Biome-canonical JSON (primitive arrays
  collapsed inline) so scaffold output passes `pnpm check` with zero format
  changes. See decision D9.
- Adding a second formatter or linter is forbidden. This keeps the config surface
  small and avoids conflicting rules.

## MVP Guardrail

This decision protects the MVP scope by keeping the toolchain surface small and
fixed. Biome as the sole linter prevents the configuration drift that slows down
feature work. The direct-root Biome invocation means `pnpm check` is a single
fast gate, not a per-project target that fragments verification. The pnpm
catalog pins every external version exactly, so no contributor or agent can
accidentally pull a different React or TypeScript version during MVP development.
