# AGENTS.md

Package brief for AI coding agents working in `@vision-control/extension`.
Read the [root brief](../../AGENTS.md) first; this file covers the
package-specific contract only. Toolchain rationale:
[ADR-006](../../docs/adr/ADR-006-wxt-react-extension.md).

## OVERVIEW

WXT + React DevTools extension. Four execution contexts, four MessageBus
instances, one background-owned daemon socket. Edits here are preview, not source.

## STRUCTURE

Four WXT contexts (one MessageBus each, filename-discovered):

- `entrypoints/devtools/main.ts` - registers the panel via `chrome.devtools.panels.create`.
- `entrypoints/panel/main.tsx` - React panel: inspector, editors, journal, connection state.
- `entrypoints/background.ts` - service worker. Owns `MessageRouter`, `TabSessionStore`, `ReconnectManager`. Only context that talks to the daemon.
- `entrypoints/content.ts` - isolated world on loopback pages by static match;
  non-loopback Site Access hosts are injected by the background service worker
  after an explicit per-host grant. Shadow-DOM overlay, picker, hit testing,
  keyboard nav.

`src/` subdomains:

- `src/messaging/` - bus, router, context-permissions, frame-discovery, tab-session, reconnect. Shared across all four contexts.
- `src/components/inspector/` - read-side UI. `InspectorPanel` takes optional additive slot props (`multiSelectGroup`, `alignmentPanel`, `autoLayoutPanel`, `gridPlacement`) for V1V2.
- `src/components/interaction/` - pure-TS controllers run in CONTENT. Bind pointer events to interaction-machine + preview-engine + change-ir. `index.ts` re-exports only `Reparent*`. Import `ReorderController` / `ResizeController` by deep path.
- `src/components/editors/`, `src/components/journal/`, `src/hooks/` - command editors, undo/redo surface, React glue for the panel.

## WHERE TO LOOK

| Need | File |
|---|---|
| Context permission boundary | `src/messaging/context-permissions.ts` |
| Per-tab / per-frame routing | `src/messaging/router.ts`, `tab-session.ts` |
| Frame enumeration | `src/messaging/frame-discovery.ts` |
| Daemon reconnect | `src/messaging/reconnect.ts` |
| Panel root + wiring | `src/App.tsx` |
| Interaction controllers | `src/components/interaction/` |
| Manifest permissions | `wxt.config.ts` |
| Permission rationale | [README.md](./README.md) |
| Isolation risk gate | `e2e/risk-gates/tab-frame-isolation.spec.ts` |

## CONVENTIONS

- **Panel routes through background, never the daemon.** `daemon:*` messages are rejected from any non-background route. See `context-permissions.ts`.
- **Panel messages carry `tabId`.** Dropped at the permission check otherwise.
- **Cross-origin frames are opaque.** Never receive edit messages. `frame-discovery` marks them `routeable: false`.
- **Loopback mandatory access only.** `host_permissions` and static content-script
  matches are `localhost` / `127.0.0.1` / `[::1]`. No `<all_urls>`, no broad
  mandatory host access, and no automatic wildcard allowlist. Extra local
  development hosts use the panel's Site Access flow: the user grants an exact
  per-host optional permission, then the background service worker dynamically
  injects eligible tabs. See [ADR-007](../../docs/adr/ADR-007-loopback-daemon.md),
  [ADR-016](../../docs/adr/ADR-016-firefox-support-level.md).
- **InspectorPanel slots are additive.** V1V2 panels render only when their slot
  prop carries data (the additive-slot contract). The **emission side is wired**
  (v0.2.0): the content runtime publishes the messages the panel hooks already
  subscribe to — `multi-select-group` (`overlay/multi-select-controller.ts`),
  `grid-placement` (`overlay/grid-placement-controller.ts`), the daemon-fed
  `component-props` response (`hooks/useComponentProps.ts`), and the
  `activeBreakpoint` enrichment on the selection summary
  (`overlay/breakpoint-controller.ts`). A panel renders on data arrival, never on
  a hard-wired unconditional mount. The slot prop is the rendering gate; the bus
  message is the wiring surface.
- **Controllers are pure TS, not React.** They bind to DOM in the content context, outside React's tree.
- **WXT entrypoints are filename-discovered.** No manual registration. `.wxt/` is generated; do not edit or commit it.
- **Manifest permission changes need a written rationale** in the PR.

## ANTI-PATTERNS

- Do not hard-wire a panel mount unconditionally in App.tsx. The additive-slot
  contract is the rendering gate: a panel renders only when its slot prop carries
  data. Wire the **emission side** — publish the bus message the panel hook
  subscribes to (`overlay/*-controller.ts`), so the data arrives and the panel
  mounts. Never short-circuit the slot by mounting a panel independent of data
  arrival.
- Do not import the daemon client from panel or content context. Panel talks to background; background talks to the daemon.
- Do not add a second router. One `MessageRouter` in `background.ts`; the permission layer assumes it.
- Do not turn interaction controllers into React components. They own pointer / DOM lifecycle outside React.
- Do not edit anything under `.wxt/`. Regenerate with `pnpm nx run extension:build`.
- Do not treat `test.fixme` stubs in `e2e/*.spec.ts` as green coverage. As of
  v0.2.0 the PRD §31.5 specs (reorder, reparent, resize, undo-redo, edit) are
  real browser-driven e2e; multi-select has 2 real content-runtime tests; the
  remaining fixme stubs (group-move, css-grid, alignment, auto-layout) are
  blocked by the panel-automation harness and carry an explicit
  `// OUT: panel-context` rationale (see
  [docs/known-limitations.md](../../docs/known-limitations.md)). Run
  `pnpm playwright install chromium` then `pnpm nx run extension:e2e` for real
  status.
- Do not couple the panel directly to `@vision-control/daemon-client`. The permission layer enforces the split.

## Verification

```bash
pnpm nx run extension:build      # -> .output/chrome-mv3/
pnpm nx run extension:test       # vitest unit + integration
pnpm nx run extension:e2e        # root specs + risk-gates/ (7 PRD Appendix-D guardrails)
```

`build:firefox` produces a valid MV2 manifest; `e2e/firefox-compat.spec.ts`
validates its security posture without a browser binary. See
[ADR-016](../../docs/adr/ADR-016-firefox-support-level.md). Decisions live under
[docs/adr/](../../docs/adr/).
