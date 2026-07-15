# Vision Control

[![Build](https://img.shields.io/badge/build-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](#)

> English. 한국어: [README.ko.md](./README.ko.md).

Vision Control is a Chromium DevTools panel plus a local daemon that turns
visual editing of a live web page into structured source-change intent. You pick
an element on the page, inspect it, and issue edit commands. The runtime
previews those edits in the browser. A read-only MCP server hands a coding agent
the context it needs to understand the page and verify its work, without ever
silently rewriting your source.

The runtime preview is not a source change. That separation is the core
guarantee of the project: visual edits stay reversible until an agent or a human
applies a real patch.

Full product scope and architecture: [Vision-Control-PRD.md](./Vision-Control-PRD.md).

---

## How it works

```
[ DevTools panel ]        pick + edit (style, layout, text, props)
        |  change IR + reversible preview
        v
[ daemon (loopback) ]     session, source registry, context compiler
        |  read-only context
        v
[ MCP server + CLI ]      coding agent reads context, patches source
        |  HMR
        v
[ verification engine ]   re-identifies the target after HMR, asserts the real DOM
```

The pipeline in three steps:

1. You edit visually in the **Vision Control** DevTools panel. Each edit becomes
   a change-IR operation with a computed inverse, applied as a reversible preview.
2. The agent reads context (current selection, changeset, source resolution,
   breakpoints, token registry) through the MCP server or CLI, then patches your
   source itself.
3. The verification engine re-identifies the target after HMR and asserts against
   the real post-HMR DOM. A preview that "looks right" is never accepted as proof.

---

## Quick start (use the tool)

Requirements: Node 22 or newer, pnpm 11.9.0 (managed through Corepack).

### 1. Install and build the artifacts

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm nx run extension:build    # -> apps/extension/.output/chrome-mv3/
pnpm nx run cli:build          # -> packages/cli/dist/bin.js  (the `vision-control` CLI)
pnpm nx run mcp-server:build   # -> packages/mcp-server/dist/bin.js  (MCP stdio server)
pnpm nx run daemon:build       # -> apps/daemon/dist/  (loopback daemon)
```

### 2. Start the daemon

```bash
vision-control daemon          # via the CLI (recommended)
# or, during development:
pnpm nx run daemon:dev
```

On a successful start the daemon prints one JSON line to stdout:

```
{"event":"ready","port":4321,"host":"127.0.0.1","pairingUrl":"vision-control://pair?token=...","pairingHttpUrl":"http://127.0.0.1:4321/pair?token=...&port=4321&host=127.0.0.1","sessionId":"..."}
```

The raw pairing token is shown exactly once. Only its SHA-256 hash is persisted.
Default TTL is about 5 minutes; the token is not consumed by loading `/pair`.
On an interactive TTY bound to `127.0.0.1`, the daemon also opens
`pairingHttpUrl` in your browser (use `--no-open` to skip, or `--open` to force
when stdout is not a TTY). The daemon binds to loopback only (`127.0.0.1`,
`::1`, `localhost`); non-loopback hosts are refused before listen. See
[apps/daemon/README.md](./apps/daemon/README.md) for the full flag list and the
optional `vision-control.config.ts`.

### 3. Load the extension in Chromium

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3/`.
4. Open DevTools on a loopback page (`http://localhost:*` / `http://127.0.0.1:*`).
   The **Vision Control** panel appears.

The built manifest is intentionally scoped: `host_permissions` are loopback only,
`debugger` is an `optional_permissions` entry and is never required. See
[apps/extension/README.md](./apps/extension/README.md) for the permissions rationale.

### Inspecting a non-loopback host (Site access)

Loopback is the default and needs no setup. To inspect a different host at
runtime, for example a dev server at `http://subshell:10601/`, use the **Site
Access** section in the Vision Control panel:

1. Open **Site Access** in the panel, type the host (for example `subshell` or
   `subshell:10601`), then click **Allow**.
2. Chrome shows a permission prompt. Grant it. Chrome match patterns do not
   include ports, so one grant for `subshell` covers every port on that host,
   including `10601`. That is Chrome's design, not Vision Control's.
3. The granted host persists across reloads and appears in the extension's Site
   Access settings. Revoke it from there or from the panel. The content script
   now injects on that host, and the panel works there: overlay, selection,
   editing, and context export.
4. Loopback stays always-on with no configuration.

This is a local development tool. Only grant hosts you control on your own
machine. There is no wildcard or auto grant: every host is an explicit, per-host,
user-gesture approval.

### 4. Pair

Preferred path when the daemon auto-opens: keep the Chromium extension loaded.
The local `http://127.0.0.1:<port>/pair?...` page (`pairingHttpUrl` in the ready
JSON) can auto-pair through the content script. Other browsers only show paste
instructions. The token in that URL can linger in browser history; close the tab
when done, and prefer a private window if that matters.

Fallback: in the **Vision Control** panel, paste the
`vision-control://pair?token=...` URL (`pairingUrl`) into the connect field, then
click **Connect** (or press Enter). Do not put the custom-scheme URL in a browser
address bar: `vision-control://` has no browser or OS protocol handler, so the
address bar treats it as a search query. It is only a data format that carries
the token, host, and port for the panel. Pasting just the token also works; the
panel fills in the daemon defaults. The panel validates the URL client-side,
connects over WebSocket, and its status moves to connected, bound to your
workspace.

### 5. Edit

- **Select and inspect**: hover to highlight, click to select. The inspector shows
  the breadcrumb, computed style, box model, classes, attributes, and semantics.
- **Edit**: use the panel editors for style, class, text, and attribute changes.
- **Multi-select**: hold Shift and click to toggle elements in a group, or drag a
  marquee rectangle to box-select. (Marquee and Shift+Click are covered by real
  browser e2e.)
- **Move and resize**: reorder within the same parent (Flex/block), reparent across
  parents (guarded so a normal-flow drag never collapses to absolute), and resize
  semantically (flex-basis, grid-span, align-self candidates).
- **V1 panels** (render when a multi-select group exists): **Auto Layout**
  (Hug / Fill / Fixed, direction, gap, padding, alignment), **CSS Grid** reorder
  and grid-span, and **alignment and distribution** (10 commands).
- **Component props**: edit daemon-discovered props with cross-boundary edits
  blocked unless you opt in.
- **Pseudo-elements**: edit `::before` / `::after`, plus `:hover`, `:focus`,
  `:active`, `:disabled` through a preview seam.

### 6. Undo, redo, clear preview

Undo and redo are lossless (every change-IR op carries a computed inverse). Clear
the whole preview with the panel action, or from the CLI:

```bash
vision-control preview clear
```

### 7. Export context for an agent

Get the compiled, redacted context for the current selection, in the format your
agent prefers:

```bash
vision-control context current                # JSON (default)
vision-control context current --format markdown
```

The Markdown export adds breakpoint and token-registry sections, a privacy report,
and token-budget truncation. Your agent can also pull the same context live over
MCP (see the next section).

### 8. Agent patches source, then verify

Your agent patches the source itself (Vision Control never writes source for it).
After HMR, verify the patch against the real post-HMR DOM:

```bash
vision-control verify current
```

The engine clears the preview first, re-identifies the target through the
source-id cascade, and runs the assertions against the actual DOM, not the
preview layer. That is the difference between "the preview looked right" and
"the source actually changed".

If you want a codemod path, the CLI can preview and apply a deterministic
suggestion locally (never an MCP tool):

```bash
vision-control codemod preview <suggestion-id>
vision-control codemod apply <suggestion-id> --confirm
```

### Framework setup (so source markers resolve)

Source resolution needs opaque `data-vc-source` markers, which are dev-only and
never ship to a production build:

- **Vite + React**: run your app through the Vite React plugin in dev.
- **Next.js**: wrap your config with `withVisionControlSourceMarkers`. Markers
  inject through both bundler paths, webpack (`next dev` / `next build`) and
  Turbopack (`next dev --turbo` / `next build --turbo`, Next 15+). The wrapper is
  a complete no-op when `NODE_ENV=production`. See
  [integrations/next-react/README.md](./integrations/next-react/README.md).
- **Tailwind**: v3 config and v4 CSS-first `@theme` tokens are auto-discovered by
  the daemon (no manual wiring). See
  [integrations/tailwind/README.md](./integrations/tailwind/README.md).
- **CSS Modules**: mapping is automatic (manifest plus source map). Vue and Svelte
  adapters resolve template/markup class origins. Vanilla CSS class tokens resolve
  at HIGH confidence from AST origins.

---

## Using Vision Control with a coding agent

The MCP server is read-only. It exposes 11 tools, 7 read plus 4 coordination
signals, over stdio and loopback HTTP. There is no source-mutating tool, and
there will not be one. The agent applies patches through its own file-writing
mechanism, then verification proves the result.

Build the server once:

```bash
pnpm nx run mcp-server:build
```

Environment variables the CLI and HTTP transport use:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VC_DAEMON_URL` | `http://127.0.0.1:4321` | Daemon base URL (used by `status`, `doctor`). |
| `VC_MCP_URL` | _(unset)_ | MCP HTTP endpoint, e.g. `http://127.0.0.1:4322/mcp`. Required by data commands. |
| `VC_MCP_TOKEN` | _(unset)_ | MCP session token (`Authorization: Bearer <token>`). |

Ready-to-paste config snippets for OpenCode, Claude Code, and a generic stdio +
HTTP setup are in [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).

The 11 tools:

**Read-only (7)**

- `vision_get_active_session`
- `vision_get_selection`
- `vision_get_changeset`
- `vision_get_source_context`
- `vision_get_verification_plan`
- `vision_get_diagnostics`
- `vision_capture_element`

**Coordination signals (4)**

- `vision_request_verification`
- `vision_clear_preview`
- `vision_mark_patch_started`
- `vision_mark_patch_completed`

Every response is redacted through `@vision-control/security#redactObject` before
it leaves the server. The read-only policy and the rationale for never exposing a
source-writing tool live in [docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md).

Confirm the connection end to end:

```bash
VC_MCP_URL=http://127.0.0.1:4322/mcp VC_MCP_TOKEN=change-me \
  vision-control doctor
```

### CLI command reference

```
vision-control <command> [subcommand] [options]
```

| Command | Description |
| --- | --- |
| `daemon` | Start the Vision Control daemon. |
| `status` | Show whether the daemon is reachable. |
| `sessions list` | List active daemon sessions. |
| `context current [--format json\|markdown]` | Compiled agent context for the current selection. JSON is the default. |
| `changes current` | Show the current changeset. |
| `verify current` | Request verification of the current changeset. |
| `preview clear` | Clear all runtime preview mutations. |
| `share export --out <path> [--include-screenshots]` | Export a redacted, signed session bundle (local only). |
| `share import <path>` | Import and verify a local session bundle. |
| `codemod preview <suggestion-id>` | Preview a deterministic patch suggestion. |
| `codemod apply <suggestion-id> --confirm` | Apply a suggestion (local agent action; never an MCP tool). |
| `doctor` | Run workspace and runtime health checks. |
| `help`, `--help`, `-h` | Print help. |

---

## Features

Highlights of what works in v0.2.0. The authoritative list with per-feature
status and source paths is in
[docs/feature-matrix.md](./docs/feature-matrix.md).

**Editing surface**

- Shadow-DOM overlay, element picker, and inspector (breadcrumb, computed style,
  box model, classes, attributes, semantics).
- Style, class, text, and attribute editors. Pseudo-element editing (`::before` /
  `::after`) and state pseudo-classes (`:hover`, `:focus`, `:active`, `:disabled`)
  through a preview seam.
- Multi-select via Shift+Click and marquee, plus group move (reorder and
  reparent) and semantic resize.
- Auto Layout panel (Hug / Fill / Fixed, direction, gap, padding, alignment).
- CSS Grid reorder and grid-span. Alignment and distribution (10 commands).
- Component props editing (daemon-fed discovery). Breakpoint and viewport context.

**Source resolution**

- Dev-only opaque `data-vc-source` markers via Vite + React, and Next.js (webpack
  and Turbopack). Production builds ship zero markers.
- Tailwind v3 config and v4 `@theme` token-aware editing. CSS Modules mapping.
  Vue, Svelte, CSS-in-JS, and vanilla CSS adapters.
- Never-wrong-HIGH policy: a registry-only candidate never reaches HIGH confidence.

**Context, verification, and services**

- Redacted JSON and Markdown context export, with breakpoint and token-registry
  sections, a privacy report, and token-budget truncation.
- HMR verification engine that re-identifies the target after HMR and asserts
  against the real post-HMR DOM.
- Authenticated loopback daemon with SQLite persistence, one-time pairing token,
  and an append-only audit log.
- Read-only MCP server: 11 tools over stdio and loopback HTTP.

---

## Limitations

Vision Control is a local development tool. No packages are published to a
registry, and the extension is not on a browser store. The boundaries below are
explicit, not silent. Full detail in
[docs/known-limitations.md](./docs/known-limitations.md).

- **The preview is not a source change.** A runtime edit only becomes real when an
  agent or human applies an actual patch and verification passes against the
  post-HMR DOM.
- **Firefox is manifest-only.** The compatibility matrix validates the build and
  manifest security posture. Browser-driven Firefox checks are stubbed, and the
  Chromium (MV3) build is the primary target (ADR-016).
- **Panel-bound V1 features lack browser-driven e2e.** Group move, CSS Grid
  reorder and span, alignment and distribution, and Auto Layout are wired into the
  content runtime and unit-tested end to end, but their user-visible flows live in
  the DevTools panel, which the current Playwright harness cannot drive. Content
  features (select, Shift+Click multi-select, marquee) do have real browser e2e.
  This is a verification follow-up, not an implementation gap.
- **No remote collaboration.** Only local share bundles ship (ADR-015). Remote
  real-time collaboration is deferred behind a trust-model ADR (ADR-018).
- **Accessibility repair is advisory only.** The system reports issues and
  suggested fixes; it never auto-mutates the DOM or source (ADR-017).

---

## For contributors and developers

The gates below must pass before a task is declared complete. Capture real
command output, not summaries, under `.omo/evidence/task-<N>-*.md`.

```bash
pnpm check          # Biome lint + format check (Biome is the only formatter)
pnpm typecheck      # tsc --noEmit across all packages
pnpm test           # vitest run across all packages
pnpm build          # tsc -p tsconfig.build.json across all packages
pnpm boundaries     # package boundary checker
pnpm test:e2e       # Playwright e2e (if your change touches e2e)
```

Inspect the workspace:

```bash
pnpm nx show projects   # list all 40 packages
pnpm graph              # open the Nx project dependency graph
pnpm doctor             # print the Nx environment report
vision-control doctor   # nine workspace + runtime health checks
```

### Monorepo layout

```
vision-control/
├── apps/
│   ├── extension/            Chromium extension (WXT + React)
│   ├── daemon/               Authenticated loopback daemon
│   ├── playground-react-vite/  Fixture app for development
│   └── visual-regression-lab/   Screenshot diff harness
├── packages/
│   ├── protocol/             Shared message and schema definitions
│   ├── change-ir/            Core change representation
│   ├── element-identity/     Stable element addressing
│   ├── geometry/             DOM-independent geometry math
│   ├── inspector-core/       Read-side inspection logic
│   ├── overlay-ui/           Selection overlay (browser only)
│   ├── editor-core/          Edit command logic
│   ├── interaction-machine/  Intent state machine
│   ├── layout-engine/        Layout analysis
│   ├── preview-engine/       Runtime preview renderer (browser only)
│   ├── change-journal/       Undo/redo journal
│   ├── source-registry/      Source marker registry
│   ├── source-resolver/      Element to source resolution
│   ├── workspace-index/      File index (node only)
│   ├── context-compiler/     Context export assembly
│   ├── verification-engine/  HMR assertion engine
│   ├── daemon-client/        Browser to daemon transport
│   ├── daemon-core/          Daemon request handling (node only)
│   ├── storage/              Persistence layer (node only)
│   ├── security/             Auth and redaction
│   ├── mcp-server/           Read-only MCP server (node only)
│   ├── cli/                  Command-line entry point (node only)
│   ├── logger/               Structured logging interface
│   ├── testing/              Shared test utilities
│   └── shared-ui/            Shared React components
├── integrations/
│   ├── vite-react/           Vite + React source marker plugin
│   ├── next-react/           Next.js integration (V1)
│   ├── tailwind/             Tailwind integration (V1)
│   ├── css-modules/          CSS Modules mapping (V1)
│   ├── vanilla-css/          Plain CSS support
│   ├── opencode/             OpenCode adapter example
│   └── pi/                   Pi adapter example
├── tools/
│   └── nx-plugin/            Package generator + boundary checker
├── docs/
│   ├── adr/                  Architecture Decision Records
│   └── agents/               Agent instruction guides
├── Vision-Control-PRD.md     Product requirements and architecture
├── CONTRIBUTING.md           Development setup and conventions
└── AGENTS.md                 Brief for AI coding agents
```

The authoritative directory tree is [PRD section 20.2](./Vision-Control-PRD.md)
and the package boundary rules are
[PRD section 20.3](./Vision-Control-PRD.md). Two rules are enforced by
`pnpm boundaries`: a `platform:node` package must not import a `platform:browser`
package, and no package may deep-import another package's `src/`. Full rules and
examples: [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md).

### Architecture decisions

Every significant decision is recorded as an Architecture Decision Record under
[docs/adr/](./docs/adr/). Start with
[ADR-001](./docs/adr/ADR-001-toolchain.md) for the toolchain rationale, then read
in order. Each ADR has a guardrail section that explains what the decision
protects against and which features it deliberately excludes.

### Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, commit
conventions, the package generator, and the PR checklist.

If you are an AI coding agent working in this repo, read
[AGENTS.md](./AGENTS.md) first. It covers the hard guardrails: no source-mutating
MCP tools, no production source markers, and the v0.2.0 scope boundaries.

---

## Troubleshooting and docs

- Problems installing, building, or connecting:
  [docs/troubleshooting.md](./docs/troubleshooting.md).
- Security and privacy posture:
  [docs/security-privacy-overview.md](./docs/security-privacy-overview.md).
- MCP server setup for OpenCode, Claude Code, and generic stdio plus HTTP:
  [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).
- Feature status with source paths: [docs/feature-matrix.md](./docs/feature-matrix.md).
- Scope boundaries: [docs/known-limitations.md](./docs/known-limitations.md).
- Generated protocol JSON Schema:
  [docs/json-schemas/protocol-envelope.json](./docs/json-schemas/protocol-envelope.json).
- Architecture decisions: [docs/adr/](./docs/adr/). Agent-facing engineering
  contracts: [docs/agents/](./docs/agents/).
- Release notes: [v0.2.0](./docs/release-notes-v0.2.0.md),
  [v0.1.0](./docs/release-notes-v0.1.0.md). Upgrade from v0.1.0:
  [docs/migration-v0.1.0-to-v0.2.0.md](./docs/migration-v0.1.0-to-v0.2.0.md).
