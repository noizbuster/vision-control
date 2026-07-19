# @vision-control/extension

Chromium extension for Vision Control, built with [WXT](https://wxt.dev) and React.

> Nx tags: `platform:browser`, `type:app`, `scope:extension`.

## Architecture overview

The extension is the source of truth for Vision Control. The DevTools panel is
the editing surface; the background service worker owns the per-tab journal in
`chrome.storage.session` and routes messages; the content script hosts the
shadow-DOM overlay and hit testing on the inspected page. The optional
single-process MCP bridge projects extension state to a coding agent. It is not
required for editing and is never a second source of truth.

```
[ inspected page ]
   |  content script (isolated world): overlay + hit testing + DOM adapter
   v
[ background service worker ]: message router + extension-owned tab journal
   |  optional paired WebSocket (127.0.0.1:4322)
   v
[ MCP bridge ]: read-only projection + coordination signals
   v
[ coding agent ]  <-- writes source with its own file tools
```

Key invariants:

- The panel routes through the background. Selection, preview, and journal state
  remain extension-owned whether an agent is paired or not.
- Each tab owns an isolated session; content scripts cannot target another tab,
  and cross-origin frames are opaque and never receive edit messages.
- Preview mutations are reversible and are not source changes. An agent or human
  applies any source patch with its own file tools.
- MCP is an optional, read-only projection. There is no source-mutating MCP tool.

## Entrypoints

WXT discovers entrypoints under [`entrypoints/`](./entrypoints/):

- `devtools/index.html` + `main.ts` — DevTools page that registers the **Vision Control** panel via `chrome.devtools.panels.create`.
- `panel/index.html` + `main.tsx` — The DevTools panel UI (React): inspector, editors, journal, and optional agent pairing state.
- `background.ts` — Service worker: message router with per-tab/per-frame isolation, the extension-owned tab journal (`chrome.storage.session`), and optional MCP bridge pairing.
- `content.ts` — Isolated-world content script for loopback pages: shadow-DOM overlay, element picker, hit testing, keyboard navigation. Non-loopback Site Access hosts are injected on demand by the background service worker after an explicit per-host grant.

## Scripts

Run from the repository root:

```bash
pnpm nx run extension:dev       # WXT HMR for extension-only editing
pnpm nx run extension:build     # Production build -> .output/chrome-mv3/
pnpm nx run extension:typecheck
pnpm nx run extension:test
```

## Optional MCP bridge

Ordinary select, preview, undo/redo, and context export need only the extension.
To connect a coding agent, start the optional single-process bridge from the
repository root:

```bash
pnpm nx run mcp-server:build
pnpm nx run cli:build
vision-control mcp
```

The bridge serves stdio MCP and the paired discovery/WebSocket transport on
`127.0.0.1:4322`. It projects extension snapshots and accepts coordination
signals only. It never writes source or mutates the extension journal. The pair
token is printed once on stderr, never on stdout or `/discover`; paste it into
the panel when pairing.

## Permissions rationale

The built `manifest.json` is intentionally scoped:

- `permissions`: `devtools`, `storage`, `activeTab`, `scripting`, `tabs`, `webNavigation`.
  `devtools` registers the panel; `scripting`/`tabs`/`activeTab` drive inspected-window
  work; `storage` persists panel settings; `webNavigation` enumerates frames for
  same-origin routing.
- `optional_permissions`: `debugger` only — it is **not** mandatory (PRD guardrail).
  The extension works without it for the MVP.
- `host_permissions`: loopback only (`http://localhost/*`, `http://127.0.0.1/*`, `http://[::1]/*`).
  No `"<all_urls>"` and no broad mandatory host access.
- `optional_host_permissions`: Chromium MV3 carries `http://*/*` and `https://*/*` only as an allowed-to-ask envelope for the panel's **Site Access** flow. The panel still requests exact per-host origins, such as `http://subshell/*` and `https://subshell/*`, from a user gesture.

## Loading the extension

1. Run `pnpm nx run extension:build`.
2. Open Chromium and navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3/`.
5. Open DevTools on a loopback page — the **Vision Control** panel will appear.

## Notes

- `public/icon.png` is a 32x32 solid-color placeholder generated for the MVP.
- Dev server: `pnpm nx run extension:dev` (WXT HMR). E2E: `pnpm nx run extension:e2e`.
