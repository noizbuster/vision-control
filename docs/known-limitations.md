# Known Limitations (v0.2.0)

Scope boundaries for v0.2.0. Each limitation is bounded by an ADR or a documented
diagnostic so the boundary is explicit, not silent.

## V2: Remote real-time collaboration (deferred)

Remote collaboration is **not** shipped. The only collaboration surface is the
local export/import share bundle from
[ADR-015](./adr/ADR-015-share-bundles-collaboration-trust.md). There is no relay,
no cloud sync, no peer-to-peer transport, and no remote session join. Remote
collaboration requires a dedicated trust-model ADR approving identity,
revocation, encryption, and transport policy before any remote surface exists
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

## V1: Panel-bound features (browser-driven e2e blocked by panel-automation harness)

The V1 panel-bound editing features — group move (reorder/reparent), CSS Grid
reorder/span, alignment + distribution, and Auto Layout (Hug/Fill/Fixed) — are
**fully wired into the content runtime and unit-tested end-to-end**, but their
user-visible flows cannot be driven through a real Playwright browser e2e today.
The blocking reasons are properties of the verification harness, not of the
implementation:

- The Playwright overlay harness loads the built extension's content runtime +
  overlay only. It does **not** open the DevTools panel. Chromium's
  `--auto-open-devtools-for-tabs` flag opens the DevTools frontend in a separate
  App-section target that `context.pages()` does not expose, so the panel DOM is
  not reachable from a Playwright page handle.
- Interaction modes (Inspect, Move, Resize, Text, Layout) are routed through the
  extension bus by the DevTools panel toolbar. The browser e2e harness can seed
  that content-side mode message for overlay-only assertions, but it still cannot
  inspect or click panel controls.
- Panel commands (alignment, grid placement, Auto Layout) are reachable through
  DevTools panel controls. The overlay harness does not open the panel, so those
  command flows remain outside browser-driven e2e coverage.
- The operations these features emit (`group-reorder`, `group-reparent`,
  `grid-reorder`, `grid-span`, alignment intents, `set-container-layout`) record
  to the change journal, which lives in the DevTools panel context.

Consequence: the browser-driven e2e specs for these features —
`apps/extension/e2e/group-move.spec.ts`,
`apps/extension/e2e/css-grid-edit.spec.ts`,
`apps/extension/e2e/alignment-distribution.spec.ts`, and
`apps/extension/e2e/auto-layout.spec.ts` — carry their scenarios as
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

A future task that drives the panel via the Chrome DevTools Protocol
`Runtime.evaluate` against the panel target would unblock these specs. That is
not in v0.2.0 scope.

## V1: Dynamic CSS-in-JS class resolution (agent-required)

CSS-in-JS adapters resolve statically-extractable class origins to HIGH
confidence (literal string values, numeric literals, interpolation-free template
literals, backed by AST origin + a source range). **Any** dynamic marker
(template interpolation, computed keys, spreads, member access, function calls,
bare-identifier values) downgrades the candidate to agent-required (MEDIUM,
evidence `text-search`), because the class is generated at runtime and cannot be
deterministically patched.

v0.2.0 does **not** claim HIGH confidence for runtime-generated CSS-in-JS
classes. An agent must resolve dynamic styles; the never-wrong-HIGH policy
enforces this structurally.

## V1: Tailwind v4 dynamic spacing scale

The Tailwind v4 `@theme` parser (plan tasks 11–12) parses **explicit** `@theme`
custom-property declarations (`--color-*`, `--spacing-*`, `--font-*`,
`--text-*`). v4's dynamic spacing scale — a single `--spacing` base multiplier
from which the synthesised `--spacing-N` scale is derived (`gap-2` →
`calc(var(--spacing) * 2)`) — is **not** synthesised by the parser. A workspace
that declares only `@theme { --spacing: 0.25rem; }` (no explicit `--spacing-N`)
gets an empty v4 spacing registry from the parser; standard utilities (`gap-2`)
still resolve via the baked-in v3 default scale. The narrow `TokenCategory` set
also means `--radius-*`, `--shadow-*`, `--leading-*`, and `--font-weight-*`
namespaces are recognised-but-skipped (those tokens reach the unified registry
via plain CSS custom-property extraction, not the v4 parser).

## Carry-over from v0.1.0

- This is a local development tool; no packages are published to a registry and
  the extension is not on a browser store.
- Screenshots are opt-in only; default context exports exclude screenshots
  entirely.
