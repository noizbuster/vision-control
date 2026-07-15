# Vision Control Feature Matrix

Status of every feature by release track. **MVP** = v0.1.0 scope (PRD 7.1).
**V1** = v0.2.0 V1 scope (PRD 7.2). **V2** = v0.2.0 V2 scope (PRD 7.3, partial).
**Pivot** = extension source of truth + optional MCP bridge (ADR-019/020).

Legend: **done** (implemented and tested), **partial** (implemented with a
documented scope boundary), **partial  -  manifest only** (build/package
validated, browser-driven checks still stubbed), **advisory** (suggestions only,
never auto-applied), **deferred** (explicitly out of scope), **dropped** (removed
from product path by ADR-019 regression ledger).

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

- **browser e2e**  -  at least one real (non-`test.fixme`) Playwright spec drives
  the feature through the live overlay/fixture harness. The spec path is cited.
- **wired + unit-tested; browser e2e blocked**  -  the feature is wired into the
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
| Single-element selection + inspector | done |  -  | Shadow-DOM overlay, picker, breadcrumb. `packages/overlay-ui`, `packages/inspector-core`. Works agent-disconnected. |
| Style / class / text editors | done |  -  | CSS property allowlist; `runtime` flag. `packages/editor-core/src` (style/class/text ops), `apps/extension/src/components/editors`. |
| Semantic resize + guarded reparent | done |  -  | Normal-flow drag never collapses to absolute. Real browser e2e: `apps/extension/e2e/resize.spec.ts`, `reparent.spec.ts`. `packages/layout-engine/src/resize-candidates.ts`, `apps/extension/src/components/interaction/`. |
| Flex reorder | done |  -  | Single-element. Real browser e2e: `apps/extension/e2e/reorder.spec.ts`. `packages/change-ir/src/operations/reorder.ts`. |
| Multi-select (marquee + group) |  -  | done | Shift+click + marquee. Real browser e2e (content-runtime): `apps/extension/e2e/multi-select.spec.ts`. `packages/element-identity/src/multi-select-identity.ts`, `apps/extension/src/overlay/`. |
| Group move (reorder / reparent) |  -  | done  -  wired + unit-tested; browser e2e blocked | Panel journal path; browser e2e blocked by panel harness. `packages/layout-engine/src/group-move-candidates.ts`. |
| Auto Layout (Hug / Fill / Fixed) |  -  | done  -  wired + unit-tested; browser e2e blocked | `packages/layout-engine/src/auto-layout/`. Panel-context e2e blocked. |
| CSS Grid reorder + grid-span |  -  | done  -  wired + unit-tested; browser e2e blocked | `packages/layout-engine/src/grid/`, `packages/change-ir/src/operations/grid.ts`. |
| Alignment + distribution (10 cmds) |  -  | done  -  wired + unit-tested; browser e2e blocked | `packages/layout-engine/src/alignment/alignment-candidates.ts`. |
| Breakpoint context + scoped edits |  -  | done | Content-runtime `matchMedia` resolver. `apps/extension/src/overlay/breakpoint-controller.ts`, `packages/change-ir/src/operations/breakpoint.ts`. |
| Component props editing (AST) |  -  | dropped | Component-props AST product path removed (ADR-019 C7). |
| Confidence detail UI |  -  | done | Method/reason badges. `apps/extension/src/components/inspector/SourceConfidence.tsx`. |
| Tab journal SoT (session storage) |  -  | done (pivot) | Background sole writer to `journal:v1:${tabId}` (ADR-019 C1). |
| Offline edit (no MCP / no Node) |  -  | done (pivot) | Select, preview, undo/redo, panel export while agent-disconnected. |

## Source resolution / origins

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| Dev-only source markers (Vite + React) | done | dropped product path | Marker HIGH product path removed (ADR-019). Integrations deleted if unused after unwire. |
| Source registry + workspace index | done | dropped | No product path (ADR-019 C7). |
| CSSOM + source-map origins |  -  | done (pivot) | `packages/map-origins`. HIGH requires map + range. Caps per C4. |
| Tailwind / CSS Modules / Vue / Svelte workspace adapters |  -  | dropped workspace path | CSSOM + maps only. |
| Pseudo-element editing |  -  | done | `packages/preview-engine/src/pseudo-preview.ts`, panel `PseudoElementEditor`. |
| Design token registry (workspace) |  -  | dropped product path | Prefer map origins + agent judgment. |

## Suggestions, verification, and context

| Feature | MVP (v0.1.0) | V1 (v0.2.0) | Notes |
|---|---|---|---|
| HMR verification engine | done | done (rehomed) | Content-owned verify after clear preview (ADR-019 C6). `packages/verification-engine`. MCP projects result when paired. |
| Change IR + inverses | done (8 kinds) | done (+14 kinds) | Lossless undo/redo. `packages/change-ir`, `packages/change-journal`. |
| Deterministic patch suggestions |  -  | done | Inert `suggestedDiff` data; no MCP write tool (ADR-012). |
| Optional direct codemod (product CLI) |  -  | dropped | Agent file tools only (ADR-014 supersession). |
| Context export (JSON + Markdown) | done | done (rehomed) | Panel export + MCP `vision_get_source_context` from extension snapshot. `packages/context-compiler`. |
| MCP server (read-only) | done (11 tools) | done (9 tools, pivot) | ADR-020 C5 slim set. stdio + discover/bridge `:4322`. No daemon. `packages/mcp-server/src/tools/index.ts` (`TOOL_NAMES`). |
| Always-on loopback daemon | done | dropped | Extension SoT; optional MCP bridge only (ADR-019/020). |
| Element screenshot crops |  -  | done | Opt-in, redacted (ADR-011). |
| Product CLI (fat surface) | done | dropped | CLI is MCP launcher only (`vision-control mcp`). |

## V2 capabilities (partial)

| Feature | V2 (v0.2.0) | Status | Notes |
|---|---|---|---|
| Firefox support | partial  -  manifest only | partial  -  manifest only | Build/package + manifest security posture validated (`apps/extension/e2e/firefox-compat.spec.ts`); browser-driven checks are `test.fixme` stubs. Not full parity (ADR-016). |
| Accessibility repair | advisory | advisory | Never auto-mutates (ADR-017). `packages/verification-engine/src/accessibility-repair/`. |
| Collaboration / sharing | deferred | deferred | Local panel export only. Remote deferred (ADR-018). CLI share path superseded. |
| Pi / OpenCode adapters | done | done | MCP config builders (no `VC_DAEMON_URL`). `integrations/opencode/`, `integrations/pi/`. |

## Explicitly deferred or dropped

- Always-on daemon backend, workspace index, marker HIGH product path,
  component-props AST (ADR-019).
- Remote real-time collaboration (ADR-018).
- Firefox parity beyond the manifest-validated matrix (ADR-016).
- Automated accessibility repair beyond advisory suggestions (ADR-017).
- Non-loopback MCP bind or multi-port scan (ADR-020).
- Source-mutating MCP tools (ADR-010/020).

See [known-limitations.md](./known-limitations.md) for details.
