<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-07-30 | Updated: 2026-07-30 -->

# extension

## Purpose

WXT + React Chromium DevTools extension (`@vision-control/extension`). Four
execution contexts, four MessageBus instances, and an extension-owned per-tab
journal. The background service worker owns journal writes to
`chrome.storage.session`; optional MCP pairing projects that extension state to
an agent. Edits here are preview, not source.

Toolchain: [ADR-006](../../docs/adr/ADR-006-wxt-react-extension.md). SoT:
[ADR-019](../../docs/adr/ADR-019-extension-source-of-truth.md). Bridge:
[ADR-020](../../docs/adr/ADR-020-mcp-bridge-projection.md).

## Key Files

| File | Description |
|------|-------------|
| `wxt.config.ts` | WXT/manifest config and permissions |
| `package.json` / `project.json` | Package metadata and Nx tags (`platform:browser`, `type:app`) |
| `entrypoints/devtools/main.ts` | Registers the panel via `chrome.devtools.panels.create` |
| `entrypoints/panel/main.tsx` | React panel entry |
| `entrypoints/background.ts` | Service worker: router, tab session, journal, bridge pairing |
| `entrypoints/content.ts` | Isolated-world content script: overlay, picker, hit testing |
| `src/App.tsx` | Panel root wiring |
| `README.md` | Human package overview |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `entrypoints/` | WXT filename-discovered contexts (see `entrypoints/AGENTS.md`) |
| `src/` | Shared and panel/content implementation (see `src/AGENTS.md`) |
| `e2e/` | Playwright e2e + risk gates (see `e2e/AGENTS.md`) |
| `public/` | Extension icons |

## For AI Agents

### Working In This Directory

- **Panel routes through background.** Selection, preview, and journal state stay
  extension-owned; MCP receives only an optional projection.
- **Panel messages carry `tabId`.** Dropped at the permission check otherwise.
- **Cross-origin frames are opaque.** Never receive edit messages.
  `frame-discovery` marks them `routeable: false`.
- **All http(s) page hosts.** `host_permissions` and static content-script matches
  are `http://*/*` and `https://*/*`. Do not use the literal `<all_urls>`. MCP
  bridge bind remains loopback-only (ADR-020).
- **InspectorPanel slots are additive.** V1V2 panels render only when their slot
  prop carries data. Wire the **emission side** (`overlay/*-controller.ts`); never
  hard-wire unconditional mounts in `App.tsx`.
- **Controllers are pure TS, not React.** They bind to DOM in the content context.
- **WXT entrypoints are filename-discovered.** `.wxt/` is generated — do not edit
  or commit it.
- **Manifest permission changes need a written rationale** in the PR.

### Testing Requirements

```bash
pnpm nx run extension:build      # -> .output/chrome-mv3/
pnpm nx run extension:test       # vitest unit + integration
pnpm nx run extension:e2e        # root specs + risk-gates/
```

`build:firefox` produces a valid MV2 manifest; `e2e/firefox-compat.spec.ts`
validates security posture without a browser binary (ADR-016).

### Common Patterns

- One `MessageRouter` in background; permission layer in `context-permissions.ts`.
- Content runtime publishes bus messages; panel hooks subscribe; slot props gate UI.
- Journal authority is background/session storage; panel is a view + command issuer.

### Anti-Patterns

- Do not hard-wire a panel mount unconditionally in `App.tsx`.
- Do not make MCP a source of truth.
- Do not add a second router.
- Do not turn interaction controllers into React components.
- Do not edit anything under `.wxt/`.
- Do not treat `test.fixme` stubs as green coverage. Remaining fixme stubs carry
  explicit `// OUT: panel-context` rationales — see
  [docs/known-limitations.md](../../docs/known-limitations.md).
- Do not add a source-mutating MCP tool.

## Dependencies

### Internal

- `@vision-control/bridge-client`, `change-ir`, `change-journal`, `protocol`,
  `preview-engine`, `verification-engine`, `inspector-core`, `overlay-ui`,
  `layout-engine`, `interaction-machine`, `editor-core`, `element-identity`,
  `geometry`, `context-compiler`, `security`, `map-origins`, `shared-ui`, etc.
  via public APIs only. No `platform:node` source imports.

### External

- WXT, React, Chrome extension APIs, Vitest, Playwright.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
