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

---

## Extension / editing surface

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Single-element selection + inspector | done | — | Shadow-DOM overlay, picker, breadcrumb. `packages/overlay-ui`, `packages/inspector-core`. |
| Style / class / text editors | done | — | CSS property allowlist; `runtime` flag. `packages/editor-core/src` (style/class/text ops), `apps/extension/src/components/editors`. |
| Semantic resize + guarded reparent | done | — | Normal-flow drag never collapses to absolute. `packages/layout-engine/src/resize-candidates.ts`, `apps/extension/src/components/interaction/ResizeController.ts` + `ReparentController.ts`. |
| Flex reorder | done | — | Single-element. `packages/change-ir/src/operations/reorder.ts`, `apps/extension/src/components/interaction/ReorderController.ts`. |
| Multi-select (marquee + group) | — | done | Group overlay; parallel-triples reducer. `packages/element-identity/src/multi-select-identity.ts`, `packages/editor-core/src/multi-select/multi-select-model.ts`. |
| Group move (reorder / reparent) | — | done | Per-element source refs; D41 guard. `packages/layout-engine/src/group-move-candidates.ts`, `packages/layout-engine/src/semantic-operations.ts`. |
| Auto Layout (Hug / Fill / Fixed) | — | done | Context-sensitive per parent layout. `packages/layout-engine/src/auto-layout/hug-fill-fixed.ts` + `auto-layout-commands.ts`. |
| CSS Grid reorder + grid-span | — | done | DOM-order vs grid-area; a11y reading-order guard. `packages/layout-engine/src/grid/`, `packages/change-ir/src/operations/grid.ts`. |
| Alignment + distribution (10 cmds) | — | done | Parent layout property or child alignment, never transforms. `packages/layout-engine/src/alignment/alignment-candidates.ts`. |
| Breakpoint context + scoped edits | — | done | `applyToBase` guard; breakpoint confidence UI. `packages/change-ir/src/operations/breakpoint.ts`, `packages/context-compiler/src/breakpoint-context.test.ts`. |
| Component props editing | — | done | Safe source-ownership rules; cross-boundary opt-in. `packages/source-resolver/src/component-props/index.ts` (`buildComponentPropEdit`) + `ownership-risk.ts`. |
| Confidence detail UI | — | done | Method/reason badges; selected + alternatives. `apps/extension/src/components/inspector/SourceConfidence.tsx`. |

## Source resolution

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Dev-only source markers (Vite + React) | done | — | Opaque `data-vc-source`; production untouched. `integrations/vite-react/src/plugin.ts` + `source-id.ts`. |
| Source registry + resolver | done | — | Never-wrong-HIGH cascade. `packages/source-registry/src/registry.ts`, `packages/source-resolver/src/index.ts`. |
| Workspace file index | done | — | Node-only. `packages/workspace-index/src/workspace-index.ts` + `file-registry.ts`. |
| CSS class-token scanning | done | — | Line-based. `packages/workspace-index/src/css-token-index.ts`. |
| Tailwind token-aware editing | — | done | v3 config parse; **v4 `@theme` not supported** (seam only, see known-limitations). `integrations/tailwind/src/adapter.ts` + `v4-seam.ts`. |
| CSS Modules mapping | — | done | Manifest + source-map; compose tracing. `integrations/css-modules/src/adapter.ts` + `manifest.ts` + `source-map.ts`. |
| Next.js integration | — | done | App + pages router; webpack loader. `integrations/next-react/src/adapter.ts` + `loader.ts`. Turbopack is diagnostic-only. |
| Vue adapter | — | done | Lightweight template scanner; diagnostics. `integrations/vue/src/adapter.ts` + `template-scanner.ts`. |
| Svelte adapter | — | done | Lightweight markup scanner; diagnostics. `integrations/svelte/src/adapter.ts` + `markup-scanner.ts`. |
| CSS-in-JS adapters | — | done | Static class origins = HIGH; **dynamic markers = agent-required** (MEDIUM, never HIGH). `packages/source-resolver/src/css-in-js/`. |
| Pseudo-element editing | — | done | `::before`/`::after` preview seam. `packages/preview-engine/src/pseudo-preview.ts`, `packages/source-resolver/src/css-in-js/pseudo-elements.ts`. |
| Vanilla CSS | — | done | Plain CSS class tokens; AST-origin HIGH. `integrations/vanilla-css/src/adapter.ts` + `stylesheet.ts`. |
| Design token registry | — | done | Multi-source ingest; conflict detection. `packages/source-resolver/src/tokens/registry.ts` + `conflict-detection.ts`. |

## Suggestions, verification, and context

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| HMR verification engine | done | — | Preview cleared before assertions. `packages/verification-engine/src/hmr-detector.ts` + `verification-plan.ts`. |
| Change IR + inverses | done (8 kinds) | done (+14 kinds) | Lossless undo/redo. `packages/change-ir/src/changeset.ts` (`computeInverse`), `packages/change-journal`. |
| Deterministic patch suggestions | — | done | Inert `suggestedDiff` data; no MCP write tool (ADR-012). `packages/change-ir/src/operations/suggested-diff.ts`. |
| Optional direct codemod | — | done | Local CLI/agent action; `--confirm` + source verify (ADR-014). `packages/cli/src/codemod/commands.ts`. |
| Context export (JSON + Markdown) | done | done | V1 sections added. `packages/context-compiler/src/compiler.ts`, `renderers/markdown-renderer.ts`. |
| MCP server (read-only, 11 tools) | done | — | stdio + loopback HTTP. No source-mutating tool. `packages/mcp-server/src/tools/index.ts` (`TOOL_NAMES`). |
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
- Turbopack marker injection (diagnostic-only; webpack path is supported).
- Dynamic CSS-in-JS HIGH-confidence resolution (always agent-required; the
  never-wrong-HIGH policy enforces this structurally).
- Tailwind v4 `@theme` variable resolution (a v4-ready seam exists in
  `integrations/tailwind/src/v4-seam.ts`; resolution is not implemented).

See [known-limitations.md](./known-limitations.md) for details.
