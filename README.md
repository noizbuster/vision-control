# Vision Control

[![Build](https://img.shields.io/badge/build-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](#)

> English. 한국어: [README.ko.md](./README.ko.md).

Vision Control turns visual editing of a live web page into structured
source-change intent. A Chromium DevTools panel lets you pick an element,
inspect it, and issue edit commands. The runtime previews those edits in the
browser. The **extension is the source of truth** for selection, preview, and
the tab journal. An **optional** single-process MCP bridge gives a coding agent
a projection of that state so it can understand the page and verify its work,
without ever silently rewriting your source.

The runtime preview is not a source change. That separation is the core
guarantee of the project: visual edits stay reversible until an agent or a human
applies a real patch.

Architecture contracts: [ADR-019](./docs/adr/ADR-019-extension-source-of-truth.md)
(extension SoT), [ADR-020](./docs/adr/ADR-020-mcp-bridge-projection.md) (MCP
bridge). Full product scope history: [Vision-Control-PRD.md](./Vision-Control-PRD.md).

---

## How it works

```
[ DevTools panel ]        pick + edit (style, layout, text)
        |  change IR + reversible preview + tab journal
        v
[ extension (SoT) ]       selection, preview, journal, map origins, verify
        |  optional pair (loopback :4322)
        v
[ MCP bridge ]            projection cache + coordination signals for an agent
        |  agent patches source with its own file tools
        v
[ content verify ]        clear preview, re-identify target, assert real DOM
```

The pipeline in three steps:

1. You edit visually in the **Vision Control** DevTools panel. Each edit becomes
   a change-IR operation with a computed inverse, applied as a reversible preview.
   Undo, redo, and panel context export work with no Node process running.
2. Optionally, start `vision-control mcp` and pair the extension. The agent reads
   a projection of selection, changeset, and context through nine read-only MCP
   tools, then patches your source itself.
3. Verification runs in the content script against the real post-HMR DOM after
   the preview is cleared. A preview that "looks right" is never accepted as proof.

---

## Quick start (extension first)

Requirements: Node 22 or newer, pnpm 11.9.0 (managed through Corepack).

You do **not** start a daemon. Ordinary editing is extension-only.

### 1. Install and build the extension

```bash
corepack enable
pnpm install --frozen-lockfile

pnpm nx run extension:build    # -> apps/extension/.output/chrome-mv3/
```

### 2. Load the extension in Chromium

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

### 3. Edit offline

No MCP process is required for the edit loop.

- **Select and inspect**: hover to highlight, click to select. The inspector shows
  the breadcrumb, computed style, box model, classes, attributes, and semantics.
- **Edit**: use the panel editors for style, class, text, and attribute changes.
- **Multi-select**: hold Shift and click to toggle elements in a group, or drag a
  marquee rectangle to box-select.
- **Move and resize**: reorder through logical Flex axes (including reverse, RTL,
  and vertical flows), reparent across parents, and resize a supported main-axis
  Flex pair as one equal-and-opposite preview/journal operation. Unsafe or
  ambiguous layouts fail closed; Move never falls back to CSS `order` or
  positioning, and normal-flow drag never collapses to absolute.
- **V1 panels** (when a multi-select group exists): **Auto Layout**, **CSS Grid**,
  and **alignment and distribution**.
- **Pseudo-elements**: edit `::before` / `::after`, plus `:hover`, `:focus`,
  `:active`, `:disabled` through a preview seam.
- **Undo / redo / clear preview**: lossless undo and redo from the panel. Clear
  the whole preview with the panel action.
- **Export context**: use the panel export for a redacted snapshot the agent can
  paste or open. Origins may be empty when maps are unavailable.

### 4. Optional: connect a coding agent (MCP bridge)

When you want an agent in the loop, start the single-process MCP bridge. It is
not required for select, preview, undo/redo, or panel export.

```bash
pnpm nx run mcp-server:build
pnpm nx run cli:build

vision-control mcp
# or: node packages/cli/dist/bin.js mcp
# or: node packages/mcp-server/dist/bin.js
```

One process serves:

1. **stdio** MCP for the coding agent (stdout is reserved for JSON-RPC)
2. **`GET http://127.0.0.1:4322/discover`** (secret-free auto-detect)
3. **`ws://127.0.0.1:4322/bridge`** (extension pair + snapshot bridge)

Port **4322** is fixed. If it is busy, the process fails with a clear error.
There is no multi-port scan product path. Bind is loopback only.

The extension pair token prints **once on stderr** (never on stdout, never in
`/discover`). Paste it into the panel connect field, or use the panel's
auto-detect against `http://127.0.0.1:4322/discover` and then paste the token.

Agent Bearer token (`VC_MCP_TOKEN`, optional HTTP MCP transport) is a **separate**
secret from the extension pair token.

Ready-to-paste agent configs: [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).

### 5. Agent patches source, then verify

Your agent patches the source itself (Vision Control never writes source for it).
After HMR, a paired agent requests verification with MCP
`vision_request_verification`. The request is a coordination signal to the
extension. The content script clears the preview first, re-identifies the
target, and asserts against the actual DOM. The panel has no verification
request control today. Offline panel behavior includes editing, preview control,
journal history, and context export, but not a verification request.

---

## Using Vision Control with a coding agent

The MCP server is read-only. It exposes **nine** tools (five read/projection plus
four coordination signals) over stdio, with discover + WebSocket bridge on
loopback port 4322. There is no source-mutating tool, and there will not be one.
The agent applies patches through its own file-writing mechanism.

**Read / projection**

- `vision_get_active_session`
- `vision_get_selection`
- `vision_get_changeset`
- `vision_get_source_context`
- `vision_get_verification_plan`

**Coordination signals**

- `vision_clear_preview`
- `vision_request_verification`
- `vision_mark_patch_started`
- `vision_mark_patch_completed`

When unpaired, tools return `not_paired` / empty / error. They never return a
stale verification `passed: true`. Live data arrives only after the extension
pairs and pushes snapshots (projection cache; ADR-020).

Every response is redacted through `@vision-control/security#redactObject` before
it leaves the server. Policy:
[docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md).

### CLI command reference

Product CLI surface is the MCP launcher only (ADR-020):

```
vision-control mcp [args...]
vision-control help
```

| Command | Description |
| --- | --- |
| `mcp` | Start the single-process MCP server (stdio + bridge `:4322`). |
| `help`, `--help`, `-h` | Print help. |

Former product commands (`daemon`, `status`, `sessions`, `context`, `changes`,
`verify`, `preview`, `share`, `codemod`, `doctor`) are removed. Use the panel for
export, use paired MCP for verification coordination, and use monorepo
`pnpm check` / `typecheck` / `test` / `build` for workspace health.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VC_MCP_BIN` | workspace `packages/mcp-server/dist/bin.js` | Override path to the MCP binary. |

No `VC_DAEMON_URL` is required or used on the product path.

---

## Features

Highlights of the extension-first product path. The authoritative list with
per-feature status and source paths is in
[docs/feature-matrix.md](./docs/feature-matrix.md).

**Editing surface (works agent-disconnected)**

- Shadow-DOM overlay, element picker, and inspector.
- Style, class, text, and attribute editors. Pseudo-element and state
  pseudo-class editing through a preview seam.
- Multi-select, group move, semantic resize, Auto Layout, CSS Grid, alignment
  and distribution.
- Tab journal with lossless undo/redo. Panel context export.

**Origins and confidence**

- Best-effort CSSOM + source-map origins (`packages/map-origins`). HIGH confidence
  requires map + range. No marker HIGH product path (ADR-019).

**Optional agent bridge**

- Single-process MCP: nine tools, stdio + discover/bridge on `:4322`.
- Content-owned HMR verification projected to MCP when paired.

---

## Limitations

Vision Control is a local development tool. No packages are published to a
registry, and the extension is not on a browser store. The boundaries below are
explicit, not silent. Full detail in
[docs/known-limitations.md](./docs/known-limitations.md).

- **The preview is not a source change.** A runtime edit only becomes real when an
  agent or human applies an actual patch and verification passes against the
  post-HMR DOM.
- **No always-on daemon.** The extension owns edit state. MCP is optional.
- **Firefox is manifest-only.** Chromium (MV3) is the primary target (ADR-016).
- **Some panel-bound V1 features lack browser-driven e2e.** Group move, CSS Grid,
  alignment, and Auto Layout are wired and unit-tested, but their specific panel
  flows remain a verification follow-up. The production panel route itself is
  browser-driven for paired Resize journal, Undo, Redo, and Clear coverage.
- **No remote collaboration.** Local panel export is the share path (ADR-015
  supersession; ADR-018 defers remote).
- **Accessibility repair is advisory only** (ADR-017).

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
pnpm nx show projects   # list packages
pnpm graph              # open the Nx project dependency graph
pnpm doctor             # print the Nx environment report
```

### Monorepo layout

```
vision-control/
├── apps/
│   ├── extension/              Chromium extension (WXT + React)  -  SoT
│   ├── playground-react-vite/  Fixture app for development
│   ├── playground-next/        Next fixture
│   └── visual-regression-lab/  Screenshot diff harness
├── packages/
│   ├── protocol/               Shared message and schema definitions
│   ├── change-ir/              Core change representation
│   ├── element-identity/       Stable element addressing
│   ├── geometry/               DOM-independent geometry math
│   ├── inspector-core/         Read-side inspection logic
│   ├── overlay-ui/             Selection overlay (browser only)
│   ├── editor-core/            Edit command logic
│   ├── interaction-machine/    Intent state machine
│   ├── layout-engine/          Layout analysis
│   ├── preview-engine/         Runtime preview renderer (browser only)
│   ├── change-journal/         Undo/redo journal
│   ├── map-origins/            CSSOM + source-map origins
│   ├── context-compiler/       Context export assembly
│   ├── verification-engine/    HMR assertion engine
│   ├── bridge-client/          Extension ↔ MCP bridge client
│   ├── security/               Auth and redaction
│   ├── mcp-server/             Read-only MCP bridge (node only)
│   ├── cli/                    MCP launcher only (node only)
│   ├── logger/                 Structured logging interface
│   ├── testing/                Shared test utilities
│   └── shared-ui/              Shared React components
├── integrations/
│   ├── opencode/               OpenCode adapter example
│   └── pi/                     Pi adapter example
├── tools/
│   └── nx-plugin/              Package generator + boundary checker
├── docs/
│   ├── adr/                    Architecture Decision Records
│   └── agents/                 Agent instruction guides
├── Vision-Control-PRD.md       Product requirements and architecture
├── CONTRIBUTING.md             Development setup and conventions
└── AGENTS.md                   Brief for AI coding agents
```

Two rules are enforced by `pnpm boundaries`: a `platform:node` package must not
import a `platform:browser` package, and no package may deep-import another
package's `src/`. Full rules:
[docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md).

### Architecture decisions

Every significant decision is recorded under [docs/adr/](./docs/adr/). Start with
[ADR-001](./docs/adr/ADR-001-toolchain.md), then read in order. For the current
product shape, prefer [ADR-019](./docs/adr/ADR-019-extension-source-of-truth.md)
and [ADR-020](./docs/adr/ADR-020-mcp-bridge-projection.md).

### Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, commit
conventions, the package generator, and the PR checklist.

If you are an AI coding agent working in this repo, read
[AGENTS.md](./AGENTS.md) first. It covers the hard guardrails: extension SoT, no
source-mutating MCP tools, no always-on daemon product path, and no production
source markers.

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
