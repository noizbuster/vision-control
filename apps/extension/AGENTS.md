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
- `entrypoints/content.ts` - isolated world on loopback pages. Shadow-DOM overlay, picker, hit testing, keyboard nav.

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
- **Loopback only.** `host_permissions` and content-script matches are `localhost` / `127.0.0.1` / `[::1]`. No `<all_urls>`. See [ADR-007](../../docs/adr/ADR-007-loopback-daemon.md), [ADR-016](../../docs/adr/ADR-016-firefox-support-level.md).
- **InspectorPanel slots are additive.** V1V2 panels render only when their slot prop is passed. App.tsx passes none yet. The gap is intentional, not broken.
- **Controllers are pure TS, not React.** They bind to DOM in the content context, outside React's tree.
- **WXT entrypoints are filename-discovered.** No manual registration. `.wxt/` is generated; do not edit or commit it.
- **Manifest permission changes need a written rationale** in the PR.

## ANTI-PATTERNS

- Do not hard-wire V1V2 panels in App.tsx. The additive-slot contract lets features land behind ADR gates, not in a wiring rush.
- Do not import the daemon client from panel or content context. Panel talks to background; background talks to the daemon.
- Do not add a second router. One `MessageRouter` in `background.ts`; the permission layer assumes it.
- Do not turn interaction controllers into React components. They own pointer / DOM lifecycle outside React.
- Do not edit anything under `.wxt/`. Regenerate with `pnpm nx run extension:build`.
- Do not treat `test.fixme` stubs in `e2e/*.spec.ts` as green coverage. They are V1V2 placeholders; `pnpm playwright install chromium` then run them for real status.
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
