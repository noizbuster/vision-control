# Vision Control v0.2.0 — V1/V2 Release Notes

**Tag:** `v0.2.0`
**Status:** V1 feature set complete; V2 capabilities at tested parity scope.

Vision Control v0.2.0 extends the MVP with the V1 editing model (multi-select,
group move, Auto Layout, CSS Grid, breakpoints, framework adapters) and selected
V2 capabilities (Firefox at tested parity, advisory accessibility repair,
collaboration share bundles, direct codemod). The core guarantee is unchanged:
**a visual edit is a preview, never a silent source change.**

See the [feature matrix](./feature-matrix.md) for the per-feature status and the
[migration notes](./migration-v0.1.0-to-v0.2.0.md) for upgrading from v0.1.0.

---

## What is new in v0.2.0

### V1 editing model

- **Multi-select and group move** — marquee selection, multi-member overlay, and
  group reorder/reparent with per-element source refs. Normal-flow group drags
  never collapse to absolute positioning (PRD constraint 2).
- **Auto Layout** — Hug/Fill/Fixed sizing resolved context-sensitively per parent
  layout (flex-row, flex-column, block, grid), with optional Tailwind token hints.
- **CSS Grid** — grid reorder (DOM-order vs grid-area, with an accessibility
  reading-order guard) and grid-span operations.
- **Alignment and distribution** — ten snap/distribute/equal-gap/match-size
  commands resolved to parent layout properties or child alignment, never pixel
  transforms.
- **Breakpoints** — responsive context capture (`breakpoint`, `mediaSource`,
  `activeViewport`), scoped breakpoint operations, and a `applyToBase` guard so a
  breakpoint edit never touches base styles without explicit opt-in.
- **Component props editing** — safe source-ownership rules for prop edits, with
  cross-boundary edits blocked unless explicitly opted in.

### Source resolution adapters (V1)

- **Tailwind token-aware editing** — v3 config parsing with a v4-ready seam; token
  suggestions ("step up to nearest ~2x"); never-wrong-HIGH compliance.
- **CSS Modules mapping** — manifest + source-map-backed local class origin
  resolution (webpack/Vite css-loader, compose tracing).
- **Next.js integration** — app + pages router dev-only source markers via a
  webpack loader; production builds untouched (zero markers).
- **Vue and Svelte adapters** — lightweight template/markup scanners with explicit
  unsupported-construct diagnostics.
- **CSS-in-JS adapters** — static extractable (HIGH) vs dynamic (agent-required)
  classification; pseudo-element editing (`::before`/`::after`) via a preview seam.
- **Vanilla CSS** — plain CSS class-token resolution.
- **Design token registry** — multi-source token ingest (Tailwind + CSS custom
  properties + adapter hints) with conflict detection and provenance.

### Deterministic patch suggestions and codemod

- **Inert `suggestedDiff` data** — deterministic patch suggestions as data only
  (never an MCP write tool). HIGH requires qualifying evidence + a source range;
  dynamic edits are agent-required.
- **Optional direct codemod** — an explicit local CLI/agent action (`vision-control
  codemod preview|apply`) outside the MCP server, with a confirmation gate, stale
  detection, and mandatory source-after-HMR verification.

### Context, MCP, and verification (V1)

- **Context compiler** — V1 sections in JSON and Markdown export: multi-select,
  breakpoint, confidence detail, layout context, suggested diffs, screenshot ref,
  token registry, component props, adapter warnings.
- **Verification engine** — V1 operation verification plans (group, grid, breakpoint,
  multi-select), plus standalone assertions for alignment reading order and
  screenshot similarity.
- **MCP server** — read-only tools unchanged (11 tools). `vision_get_source_context`
  accepts `format: "json" | "markdown"`. No source-mutating tool exists.
- **Protocol** — bumped to 1.1.0 (additive, minor). Backward compatible with 1.0.0
  clients.

### V2 capabilities (partial, tested scope)

- **Firefox support** — a Firefox-target build (WXT `-b firefox`, MV2) validated by
  an automated compatibility matrix. Parity is bounded by what the matrix tests
  (build/package validation, manifest security posture). The manifest carries no
  `<all_urls>`, no broad host permissions, and `debugger` stays optional. See
  [ADR-016](./adr/ADR-016-firefox-support-level.md).
- **Accessibility repair suggestions** — advisory suggestions for role/name,
  label/control, focus order, DOM-vs-visual order (including CSS `order`), and
  keyboard navigation. Each suggestion carries a deterministic verification
  assertion. The system never auto-mutates the DOM or source. See
  [ADR-017](./adr/ADR-017-accessibility-repair-scope.md).
- **Collaboration / session sharing** — local export/import share bundles: a
  redacted, content-hash-signed, token-free, screenshot-free-by-default artifact
  handed out of band. No remote transport. See
  [ADR-015](./adr/ADR-015-share-bundles-collaboration-trust.md) and
  [ADR-018](./adr/ADR-018-remote-collaboration-deferred.md).
- **Element screenshot crops** — opt-in, redacted, short-retention screenshot
  capture with a two-pass (pre-mask + post-capture re-check) defense against
  leaking sensitive content. See
  [ADR-011](./adr/ADR-011-v1-screenshot-crops.md).
- **Pi and OpenCode adapter examples** — MCP config builders and agent workflow
  docs (read-only tool list validated by a freshness test).

### Toolchain

- 39 packages (up from 29) with enforced platform boundaries.
- 18 ADRs (ADR-011 through ADR-018 added for V1/V2 policy gates).
- TypeScript 6 strict, Zod 4, Vitest 4, WXT 0.20, Biome 2.5 (single formatter).

---

## Getting started (v0.2.0)

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check && pnpm typecheck && pnpm test && pnpm build && pnpm boundaries
```

Build the runnable artifacts:

```bash
pnpm nx run extension:build              # -> apps/extension/.output/chrome-mv3/
pnpm nx run extension:build:firefox      # -> apps/extension/.output/firefox-mv2/
pnpm nx run cli:build                    # -> packages/cli/dist/bin.js
pnpm nx run mcp-server:build             # -> packages/mcp-server/dist/bin.js
pnpm nx run daemon:dev                   # build + run the daemon
```

Firefox: build with `pnpm nx run extension:build:firefox` and validate the
manifest security posture with `pnpm nx run extension:e2e --grep "firefox-compat"`.

---

## Security posture (unchanged core, V2 additions)

- Loopback daemon and MCP (no network exposure); two-token auth; origin allowlist.
- Dev-only opaque source markers; production builds untouched.
- Deny-by-default redaction on every export; no unredacted path.
- Read-only MCP; no tool writes source.
- Firefox: no `<all_urls>`, no broad host permissions, no mandatory debugger
  (ADR-016).
- Share bundles: redacted, signed, token-free, screenshot-free by default;
  forbidden-token and image-data-URL guards on import (ADR-015).
- See [security-privacy-overview.md](./security-privacy-overview.md).

---

## Explicitly out of scope (deferred)

Remote real-time collaboration (ADR-018), Firefox parity beyond the tested
matrix (ADR-016), automated accessibility repair beyond advisory suggestions
(ADR-017), Turbopack marker injection (diagnostic-only), and dynamic CSS-in-JS
class HIGH-confidence resolution (agent-required). See
[known-limitations.md](./known-limitations.md).
