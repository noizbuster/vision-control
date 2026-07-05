# @vision-control/extension

Chromium extension for Vision Control, built with [WXT](https://wxt.dev) and React.

> Nx tags: `platform:browser`, `type:app`, `scope:extension`.

## Architecture overview

The extension is the browser side of Vision Control. The DevTools panel is the
editing surface; the background service worker owns daemon connectivity and
routes messages; the content script hosts the shadow-DOM overlay and hit testing
on the inspected page.

```
[ inspected page ]
   |  content script (isolated world): overlay + hit testing + DOM adapter
   v
[ background service worker ]: message router, tab/frame session store, daemon client
   |  authenticated WebSocket (loopback)
   v
[ Vision Control daemon ]
   |  read-only context
   v
[ MCP server ]  <-- coding agent
```

Key invariants:

- The panel never talks to the daemon directly; it routes through the background
  (`daemon-connect`/`daemon-disconnect` messages).
- Each tab owns an isolated session; content scripts cannot target another tab,
  and cross-origin frames are opaque and never receive edit messages.
- Edits created in the panel carry a `runtime` flag: preview mutations are
  reversible; source intent is the agent's responsibility to apply.

## Entrypoints

WXT discovers entrypoints under [`entrypoints/`](./entrypoints/):

- `devtools/index.html` + `main.ts` — DevTools page that registers the **Vision Control** panel via `chrome.devtools.panels.create`.
- `panel/index.html` + `main.tsx` — The DevTools panel UI (React): inspector, editors, connection state.
- `background.ts` — Service worker: message router with per-tab/per-frame isolation, tab session store (`chrome.storage.session`), and the daemon reconnect manager (`@vision-control/daemon-client`).
- `content.ts` — Isolated-world content script for loopback pages: shadow-DOM overlay, element picker, hit testing, keyboard navigation. Non-loopback Site Access hosts are injected on demand by the background service worker after an explicit per-host grant.

## Scripts

Run from the repository root:

```bash
pnpm nx run extension:dev      # WXT dev server with HMR
pnpm nx run extension:build    # Production build -> .output/chrome-mv3/
pnpm nx run extension:typecheck
pnpm nx run extension:test
```

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
