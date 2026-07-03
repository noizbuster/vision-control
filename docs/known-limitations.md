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

## V1: Turbopack marker injection (diagnostic-only)

The Next.js integration injects dev-only source markers via a **webpack** loader.
Turbopack does not expose an equivalent dev-only transform hook in this repo's
supported Next.js version, so Turbopack dev runs produce a diagnostic indicating
that source-marker resolution is unavailable. The webpack path (the default for
`next dev` without `--turbo`) is fully supported. Production builds are always
untouched regardless of bundler.

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

## V1: Tailwind v4 theme variable resolution (seam only)

The Tailwind adapter parses v3 configs. A v4-ready seam
(`TailwindV4ThemeRegistry` interface + a no-op default implementation) exists so
a future task can wire real v4 theme-variable resolution without an adapter
rewrite. v4 `@theme` variable resolution is **not** implemented in v0.2.0.

## Carry-over from v0.1.0

- CSS class-token scanning is line-based; multi-line selectors ending in `,`
  before the brace may under-capture.
- This is a local development tool; no packages are published to a registry and
  the extension is not on a browser store.
- Screenshots are opt-in only; default context exports exclude screenshots
  entirely.
