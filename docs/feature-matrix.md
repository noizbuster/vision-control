# Vision Control Feature Matrix

Status of every feature by release track. **MVP** = v0.1.0 scope (PRD 7.1).
**V1** = v0.2.0 V1 scope (PRD 7.2). **V2** = v0.2.0 V2 scope (PRD 7.3, partial).

Legend: **done** (implemented and tested), **partial** (implemented with a
documented scope boundary), **partial — manifest only** (build/package
validated, browser-driven checks still stubbed), **advisory** (suggestions only,
never auto-applied), **deferred** (explicitly out of scope for v0.2.0).

Every **done** row cites its implementing source path so the claim is verifiable.
A status is only **done** when the implementation is wired into the runtime, not
just unit-tested in isolation. Per-task verification evidence for the v0.2.0
remediation waves lives under `.omo/evidence/task-*-prd-gap-remediation.md`
(local working memory per ADR-005; the `.omo/` tree is gitignored, so source
paths are the durable reference).

### Browser-driven verification status (honesty note)

A **done** feature is wired into the runtime and covered by unit/integration
tests. Browser-driven e2e (real Playwright Chromium against the built extension)
is tracked per row:

- **browser e2e** — at least one real (non-`test.fixme`) Playwright spec drives
  the feature through the live overlay/fixture harness. The spec path is cited.
- **wired + unit-tested; browser e2e blocked** — the feature is wired into the
  content runtime and its full chain is unit-tested, but the user-visible flow
  renders in the DevTools panel context. The current Playwright overlay harness
  loads the content runtime + overlay only; it cannot open the DevTools panel
  (`--auto-open-devtools-for-tabs` does not expose the panel as a page target,
  and Move/panel modes have no keyboard shortcut). Those flows stay
  `test.fixme` with a documented `// OUT: panel-context` rationale. See the
  [panel-automation harness limitation](./known-limitations.md#v1-panel-bound-features-browser-driven-e2e-blocked-by-panel-automation-harness).
  This is a verification follow-up, not an implementation gap.

---

## Extension / editing surface

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Single-element selection + inspector | done | — | Shadow-DOM overlay, picker, breadcrumb. `packages/overlay-ui`, `packages/inspector-core`. |
| Style / class / text editors | done | — | CSS property allowlist; `runtime` flag. `packages/editor-core/src` (style/class/text ops), `apps/extension/src/components/editors`. |
| Semantic resize + guarded reparent | done | — | Normal-flow drag never collapses to absolute. Real browser e2e: `apps/extension/e2e/resize.spec.ts`, `reparent.spec.ts` (serveFixture + live overlay drag). `packages/layout-engine/src/resize-candidates.ts`, `apps/extension/src/components/interaction/ResizeController.ts` + `ReparentController.ts`. |
| Flex reorder | done | — | Single-element. Real browser e2e: `apps/extension/e2e/reorder.spec.ts`. `packages/change-ir/src/operations/reorder.ts`, `apps/extension/src/components/interaction/ReorderController.ts`. |
| Multi-select (marquee + group) | — | done | Emission wired (plan task 2): shift+click toggles membership (stamps `vc-multi-` preview id); marquee drag renders `.vc-marquee-rect` and feeds the hit-test. Real browser e2e (content-runtime observables): `apps/extension/e2e/multi-select.spec.ts` (2 non-fixme tests). Panel-bound scenarios (member/group outlines, common-parent, cross-frame/closed-shadow diagnostics) are `test.fixme` — panel-automation harness limitation (see known-limitations). `packages/element-identity/src/multi-select-identity.ts`, `apps/extension/src/overlay/multi-select-controller.ts` + `marquee-controller.ts`. |
| Group move (reorder / reparent) | — | done — wired + unit-tested; browser e2e blocked | Controller wired (plan task 3): `interaction-wiring.ts` routes a multi-select drag through `classifyGroupMove` → `ReorderController.reorderGroup` / `ReparentController.reparentGroup`. Full chain unit-tested: `apps/extension/e2e/group-move.spec.ts` (`@group-move unit`: classify → build op → `computeInverse`, D41 rejection). Browser-driven e2e blocked — the op records to the panel journal and Move mode has no keyboard shortcut; all 4 `@group-move browser` tests are `test.fixme` (panel-automation harness limitation). `packages/layout-engine/src/group-move-candidates.ts`, `packages/layout-engine/src/semantic-operations.ts`. |
| Auto Layout (Hug / Fill / Fixed) | — | done — wired + unit-tested; browser e2e blocked | `AutoLayoutPanel` renders from the selection summary and emits `set-container-layout` / `set-child-sizing` ops (`App.tsx` slot + `handleEditorCommand`). Unit-tested in `packages/layout-engine/src/auto-layout/`. Browser-driven e2e blocked — the panel renders in the DevTools panel context; all `@auto-layout` tests are `test.fixme` (panel-automation harness limitation). `packages/layout-engine/src/auto-layout/hug-fill-fixed.ts` + `auto-layout-commands.ts`. |
| CSS Grid reorder + grid-span | — | done — wired + unit-tested; browser e2e blocked | Emission wired (plan task 4): selecting a grid child publishes `grid-placement`; grid drag routes through `resolveGridIntent` → `grid-reorder` (default `grid-area`, never silent DOM rewrite) / `grid-span`. Full chain unit-tested: `apps/extension/e2e/css-grid-edit.spec.ts` (`@css-grid-edit unit`: `inferGridCells` → `resolveGridIntent` → `computeInverse`). Browser-driven e2e blocked — grid placement fills the panel `GridPanel`; all 4 `@css-grid-edit browser` tests are `test.fixme` (panel-automation harness limitation). `packages/layout-engine/src/grid/`, `packages/change-ir/src/operations/grid.ts`. |
| Alignment + distribution (10 cmds) | — | done — wired + unit-tested; browser e2e blocked | Renders end-to-end once multi-select emits (plan task 2); the `AlignmentPanel` issues commands that resolve to parent layout properties or child alignment, never pixel transforms. Full chain unit-tested: `apps/extension/e2e/alignment-distribution.spec.ts` (`@alignment-distribution unit`: `resolveAlignmentCandidate`, D41, reading-order a11y). Browser-driven e2e blocked — commands issue via the panel; all 3 `@alignment-distribution browser` tests are `test.fixme` (panel-automation harness limitation). `packages/layout-engine/src/alignment/alignment-candidates.ts`. |
| Breakpoint context + scoped edits | — | done | Content-runtime `matchMedia` resolver emits `activeBreakpoint` on the selection summary (plan task 7); daemon `compileContext` plumbs the breakpoint section (plan task 8). `applyToBase` guard. `apps/extension/src/overlay/breakpoint-controller.ts`, `packages/change-ir/src/operations/breakpoint.ts`, `packages/context-compiler/src/breakpoint-context.test.ts`. |
| Component props editing | — | done | Daemon-fed prop discovery emission (plan task 5) replaces the `[]` stub; `useComponentProps` hook subscribes; cross-boundary edits blocked without opt-in. `apps/extension/src/hooks/useComponentProps.ts`, `packages/source-resolver/src/component-props/index.ts` (`buildComponentPropEdit`) + `ownership-risk.ts`. |
| Confidence detail UI | — | done | Method/reason badges; selected + alternatives. `apps/extension/src/components/inspector/SourceConfidence.tsx`. |

## Source resolution

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Dev-only source markers (Vite + React) | done | — | Opaque `data-vc-source`; production untouched. `integrations/vite-react/src/plugin.ts` + `source-id.ts`. |
| Source registry + resolver | done | — | Never-wrong-HIGH cascade. `packages/source-registry/src/registry.ts`, `packages/source-resolver/src/index.ts`. |
| Workspace file index | done | — | Node-only. `packages/workspace-index/src/workspace-index.ts` + `file-registry.ts`. |
| CSS class-token scanning | done | — | Brace-depth state machine; multi-line comma selectors + `@media`-nested selectors captured (plan task 14). `packages/workspace-index/src/css-token-index.ts`. |
| Tailwind token-aware editing | — | done | v3 config parse **and** v4 CSS-first `@theme` parsing (plan tasks 11–12): PostCSS `@theme` walk → `TokenCategory`; v4 utility renames; daemon auto-detects v3 vs v4. A registry-only candidate never reaches HIGH. `integrations/tailwind/src/adapter.ts` + `v4-theme-parser.ts` + `v4-seam.ts`. |
| CSS Modules mapping | — | done | Manifest + source-map; compose tracing. `integrations/css-modules/src/adapter.ts` + `manifest.ts` + `source-map.ts`. |
| Next.js integration | — | done | App + pages router. Markers inject via **both** bundlers: webpack loader (`next dev`/`next build`) and Turbopack `turbopack.rules` (`next dev --turbo`/`next build --turbo`, Next 15+; plan task 13). Production builds ship zero markers via either bundler. Real browser e2e: `apps/playground-next/e2e/next-source-markers.spec.ts` + turbopack-marker spec. `integrations/next-react/src/adapter.ts` + `loader.ts` + `turbopack-diagnostic.ts`. |
| Vue adapter | — | done | Lightweight template scanner; diagnostics. `integrations/vue/src/adapter.ts` + `template-scanner.ts`. |
| Svelte adapter | — | done | Lightweight markup scanner; diagnostics. `integrations/svelte/src/adapter.ts` + `markup-scanner.ts`. |
| CSS-in-JS adapters | — | done | Static class origins = HIGH; **dynamic markers = agent-required** (MEDIUM, never HIGH). `packages/source-resolver/src/css-in-js/`. |
| Pseudo-element editing | — | done | `::before`/`::after` preview seam wired (plan task 6): `pseudo-style-edit` op kind with `computeInverse` + preview-manager dispatch calling `applyPseudoPreview`; whitelist enforced. `packages/preview-engine/src/pseudo-preview.ts`, `packages/source-resolver/src/css-in-js/pseudo-elements.ts`, `apps/extension/src/components/editors/PseudoElementEditor.tsx`. |
| Vanilla CSS | — | done | Plain CSS class tokens; AST-origin HIGH. `integrations/vanilla-css/src/adapter.ts` + `stylesheet.ts`. |
| Design token registry | — | done | Multi-source ingest; conflict detection. `packages/source-resolver/src/tokens/registry.ts` + `conflict-detection.ts`. |

## Suggestions, verification, and context

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| HMR verification engine | done | — | Preview cleared before assertions; source-id cascade re-identifies the target post-HMR. Real browser e2e: `apps/extension/e2e/hmr-verification.spec.ts` (real Vite HMR reload, plan task 17). `packages/verification-engine/src/hmr-detector.ts` + `verification-plan.ts`. |
| Change IR + inverses | done (8 kinds) | done (+14 kinds) | Lossless undo/redo. `packages/change-ir/src/changeset.ts` (`computeInverse`), `packages/change-journal`. |
| Deterministic patch suggestions | — | done | Inert `suggestedDiff` data; no MCP write tool (ADR-012). `packages/change-ir/src/operations/suggested-diff.ts`. |
| Optional direct codemod | — | done | Local CLI/agent action; `--confirm` + source verify (ADR-014). `packages/cli/src/codemod/commands.ts`. |
| Context export (JSON + Markdown) | done | done | V1 sections added. Breakpoint section (plan task 8) + token-registry section (plan task 9) plumbed into daemon `compileContext` when the data exists. `packages/context-compiler/src/compiler.ts`, `renderers/markdown-renderer.ts`, `apps/daemon/src/mcp-adapters.ts`. |
| MCP server (read-only, 11 tools) | done | — | stdio + loopback HTTP. No source-mutating tool. Real browser e2e: `apps/extension/e2e/mcp-context-query.spec.ts` (`vision_get_source_context` round-trip, plan task 16). `packages/mcp-server/src/tools/index.ts` (`TOOL_NAMES`). |
| Element screenshot crops | — | done | Opt-in, redacted, short-retention (ADR-011). `packages/verification-engine/src/screenshot-crop.ts`, `packages/change-ir/src/operations/screenshot.ts`. |

## V2 capabilities (partial)

| Feature | V2 (v0.2.0) | Status | Notes |
|---|---|---|---|
| Firefox support | partial — manifest only | partial — manifest only | Build/package + manifest security posture validated (`apps/extension/e2e/firefox-compat.spec.ts`); browser-driven checks are `test.fixme` stubs. Not full parity (ADR-016). |
| Accessibility repair | advisory | advisory | Role/name, label/control, focus order, DOM-vs-visual order, keyboard nav. Never auto-mutates (ADR-017). `packages/verification-engine/src/accessibility-repair/`. |
| Collaboration / sharing | deferred | deferred | Local export/import share bundles only (ADR-015). Remote real-time collaboration deferred — needs identity, revocation, encryption, transport (ADR-018). |
| Pi / OpenCode adapters | done | done | MCP config builders + workflow docs. `integrations/opencode/`, `integrations/pi/`. |

## Explicitly deferred (not in v0.2.0)

- Remote real-time collaboration (ADR-018: needs identity, revocation,
  encryption, transport policy). Only local share bundles ship (ADR-015).
- Firefox parity beyond the manifest-validated matrix (ADR-016). Browser-driven
  checks remain stubbed.
- Automated accessibility repair beyond advisory suggestions (ADR-017).
- Dynamic CSS-in-JS HIGH-confidence resolution (always agent-required; the
  never-wrong-HIGH policy enforces this structurally).
- Tailwind v4 dynamic spacing scale (`--spacing` base multiplier → synthesised
  `--spacing-N`); only explicit `@theme` declarations are parsed.

See [known-limitations.md](./known-limitations.md) for details.
