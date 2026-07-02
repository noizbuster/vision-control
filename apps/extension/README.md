# @vision-control/extension

Chromium extension for Vision Control, built with [WXT](https://wxt.dev) and React.

> Nx tags: `platform:browser`, `type:app`, `scope:extension`.

## Entrypoints

WXT discovers entrypoints under [`entrypoints/`](./entrypoints/):

- `devtools/index.html` + `main.ts` — DevTools page that registers the **Vision Control** panel via `chrome.devtools.panels.create`.
- `panel/index.html` + `main.tsx` — The DevTools panel UI, rendered with React.
- `background.ts` — Service worker: install listener and message/connection stubs (real routing lands in task 11).
- `content.ts` — Isolated-world content script for loopback pages; bridge stub only (overlay and hit-testing are task 14).

## Scripts

Run from the repository root:

```bash
pnpm nx run extension:dev      # WXT dev server with HMR
pnpm nx run extension:build    # Production build -> .output/chrome-mv3/
pnpm nx run extension:typecheck
pnpm nx run extension:test
```

## Manifest guardrails

The built `manifest.json` is intentionally scoped:

- `permissions`: `devtools`, `storage`, `activeTab`, `scripting`, `tabs`
- `optional_permissions`: `debugger` only — it is **not** mandatory (PRD guardrail)
- `host_permissions`: loopback only (`http://localhost/*`, `http://127.0.0.1/*`, `http://[::1]/*`)
- No `"<all_urls>"` host permission

## Loading the extension

1. Run `pnpm nx run extension:build`.
2. Open Chromium and navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3/`.
5. Open DevTools on a loopback page — the **Vision Control** panel will appear.

## Placeholders

- `public/icon.png` is a 32x32 solid-color placeholder generated for the MVP.
- Message routing, daemon connection, and overlay selection are stubs; their real implementations are scheduled in later tasks.
