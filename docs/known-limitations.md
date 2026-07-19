# Known Limitations (v0.2.0 + extension-SoT pivot)

Scope boundaries for the product path after ADR-019/020. Each limitation is
bounded by an ADR or a documented diagnostic so the boundary is explicit, not
silent.

## Extension SoT: no always-on daemon

There is **no** always-on daemon product path for ordinary editing
([ADR-019](./adr/ADR-019-extension-source-of-truth.md)). The Chromium extension
owns selection, preview, and the tab journal. Select, preview, undo/redo, and
panel context export work while agent-disconnected.

An optional single-process MCP bridge
([ADR-020](./adr/ADR-020-mcp-bridge-projection.md)) projects extension state to a
coding agent when the user starts `vision-control mcp` and pairs. MCP is not the
source of truth. Unpaired MCP tools return `not_paired` / empty and never a
stale verification `passed: true`.

Dropped from the product path (regression ledger in ADR-019): workspace index /
workspace bind, marker HIGH as a product path, component-props AST, and the fat
CLI surface (context/changes/verify/preview/status/sessions/doctor/share/codemod
as product commands). Panel export and agent file tools remain.

## V2: Remote real-time collaboration (deferred)

Remote collaboration is **not** shipped. Local panel export is the share path
after the ADR-015 CLI share supersession. There is no relay, no cloud sync, no
peer-to-peer transport, and no remote session join. Remote collaboration requires
a dedicated trust-model ADR approving identity, revocation, encryption, and
transport policy before any remote surface exists
([ADR-018](./adr/ADR-018-remote-collaboration-deferred.md)).

## V2: Firefox parity (tested scope only)

Firefox support is bounded by what the automated compatibility matrix validates
([ADR-016](./adr/ADR-016-firefox-support-level.md)). The matrix validates the
build/package output and the manifest security posture (no `<all_urls>`, no broad
host permissions, `debugger` optional only, loopback-scoped hosts). The
browser-driven checks (load the extension in Firefox, verify the panel renders,
verify element selection) are stubbed and require a Firefox binary to run.

v0.2.0 does **not** claim full Firefox parity. Features not validated on Firefox
should be expected to produce explicit unsupported diagnostics rather than silent
behavior differences. The Chromium (MV3) build remains the primary target.

## V2: Accessibility repair (advisory only)

Accessibility repair is **advisory suggestions only**
([ADR-017](./adr/ADR-017-accessibility-repair-scope.md)). The system reports
issues for role/name, label/control association, focus order, DOM-vs-visual order
(including CSS `order`), and keyboard navigation, each with a suggested fix and a
deterministic verification assertion. The system **never** auto-mutates the DOM
or the source for an accessibility fix. A fix becomes a real change only through
the standard edit pipeline (change IR -> preview -> source patch -> HMR
verification).

v0.2.0 does **not** claim automated accessibility repair. A preview that "looks
fixed" is not evidence; the verification assertion must run against the actual
source after HMR.

## V1: Panel-bound features with browser-driven e2e pending

The V1 panel-bound editing features - group move (reorder/reparent), CSS Grid
reorder/span, alignment + distribution, and Auto Layout (Hug/Fill/Fixed) - are
**fully wired into the content runtime and unit-tested end-to-end**, but their
feature-specific panel flows still lack real Playwright browser coverage.

The extension fixture now opens the production panel route and drives accessible
controls. `flex-pair-flow.spec.ts` uses that route to prove one aggregate paired
Resize journal row plus Undo, Redo, and Clear. This removes the former claim that
the panel DOM is categorically unreachable; it does not turn the remaining V1
`test.fixme` scenarios into coverage. Their `panel-automation` label now names a
feature-specific coverage backlog, not a categorical harness blocker.

Consequence: the browser-driven e2e specs for these features  - 
`apps/extension/e2e/group-move.spec.ts`,
`apps/extension/e2e/css-grid-edit.spec.ts`,
`apps/extension/e2e/alignment-distribution.spec.ts`, and
`apps/extension/e2e/auto-layout.spec.ts`  -  carry their scenarios as
`test.fixme` with an explicit `// OUT: panel-context` rationale. The full
classify → build-op → `computeInverse` chain for each feature IS exercised by
the `@... unit` describe blocks in those same spec files, and the emission-side
wiring is covered by extension unit/integration tests.

This is a **verification follow-up**, not an implementation gap. Multi-select is
the one V1 editing feature with partial browser e2e: shift+click and marquee
produce observable content-runtime effects (a `vc-multi-` preview id and a
`.vc-marquee-rect` overlay element) and have 2 real (non-fixme) browser tests in
`apps/extension/e2e/multi-select.spec.ts`; its panel-bound scenarios (member/group
outlines, cross-frame/closed-shadow diagnostics) are also `test.fixme`.

Single-item Flex Move is browser-covered across reverse, RTL, vertical, and
cross-parent logical placement. Wrapped multi-line Flex Move remains deliberately
unsupported because one-dimensional midpoint ordering is ambiguous across flex
lines; it fails closed without DOM, CSS `order`, or positioning mutation.

## Origins: map + range only for HIGH

Best-effort CSSOM + source-map origins live in `packages/map-origins`. HIGH
confidence requires map + range. There is no marker HIGH product path and no
workspace-index product path (ADR-019 C4 / C7). Origins may be empty; that is
valid. Caps per selection compile: max 20 maps, max 1 MiB per map, max 2 MiB
total, 500 ms per fetch, 2 s wall clock.

## V1: Dynamic CSS-in-JS class resolution (agent-required)

When dynamic class generation is present (template interpolation, computed keys,
spreads, member access, function calls), resolution stays agent-required. The
never-wrong-HIGH policy still applies: do not invent HIGH without map + range.

## Carry-over from v0.1.0

- This is a local development tool; no packages are published to a registry and
  the extension is not on a browser store.
- Screenshots are opt-in only; default context exports exclude screenshots
  entirely.
