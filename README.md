# Vision Control

[![Build](https://img.shields.io/badge/build-pending-lightgrey)](#)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](#)

Vision Control is a Chromium DevTools panel plus local daemon that turns visual
editing of a live web page into structured source-change intent. You pick an
element on the page, inspect it, and issue edit commands. The runtime previews
those edits in the browser. An MCP server exposes read-only context so a coding
agent can understand the page, verify its work, and never silently rewrite your
source.

The runtime preview is not a source change. That separation is the core
guarantee of the project: visual edits stay reversible until an agent or a human
applies a real patch.

This repository holds the MVP scope: single-element selection, style and text
editing, Flex reorder, basic resize, source markers for React and Vite, an
authenticated loopback daemon, JSON/Markdown context export, and read-only MCP
tools. See [Vision-Control-PRD.md](./Vision-Control-PRD.md) section 7.1 for the
full MVP list and section 7.2/7.3 for what is explicitly deferred to V1 and V2.

---

## Quick start

Requirements: Node 22 or newer, pnpm 11.9.0 (managed through Corepack).

```bash
corepack enable
pnpm install --frozen-lockfile
```

Verify the toolchain and build every package:

```bash
pnpm check          # Biome lint + format check
pnpm typecheck      # tsc --noEmit across all packages
pnpm test           # vitest run across all packages
pnpm build          # tsc -p tsconfig.build.json across all packages
pnpm test:e2e       # end-to-end suite (Playwright, added in a later task)
```

Inspect the workspace:

```bash
pnpm nx show projects   # list all 29 packages
pnpm graph              # open the Nx project dependency graph
pnpm doctor             # print the Nx environment report
pnpm boundaries         # run the package boundary checker
```

Build the runnable artifacts:

```bash
pnpm nx run extension:build    # -> apps/extension/.output/chrome-mv3/
pnpm nx run cli:build          # -> packages/cli/dist/bin.js  (the `vision-control` CLI)
pnpm nx run mcp-server:build   # -> packages/mcp-server/dist/bin.js  (MCP stdio server)
pnpm nx run daemon:dev         # build + run the authenticated loopback daemon
```

Run the CLI health check (workspace gates + runtime services):

```bash
node packages/cli/dist/bin.js doctor
```

---

## MVP Status

v0.1.0 implements the full MVP scope. What works:

- **DevTools panel** — shadow-DOM overlay, element picker, inspector (breadcrumb,
  computed style, box model, classes, attributes, semantics), and style/class/text
  editors. Per-tab/per-frame session isolation.
- **Editing model** — a change IR with computed inverses, a reversible preview
  engine (style/class/text/structural transactions with rollback and React
  reconciliation detection), semantic resize, and guarded reparent. Normal-flow
  drags never collapse to absolute positioning.
- **Source markers** — dev-only, opaque `data-vc-source` markers via a Vite +
  React plugin; a source registry, resolver (never returns a wrong HIGH), and
  workspace file index. Production builds are untouched.
- **Context export** — redacted JSON/Markdown agent context with a privacy report
  and token-budget truncation.
- **Verification** — an HMR assertion engine that proves the source-patched
  runtime matches the preview.
- **Daemon** — authenticated loopback WebSocket service with SQLite persistence
  and an append-only audit log.
- **MCP server** — read-only, 7 read tools + 4 coordination signals over stdio
  and loopback HTTP. No source-changing tool.
- **CLI** — `daemon`, `status`, `sessions`, `context`, `changes`, `verify`,
  `preview`, and `doctor`.

Explicitly deferred to V1/V2: multi-select, group move, Auto Layout, CSS Grid
reorder, Tailwind token-aware editing, CSS Modules mapping, Next.js/Vue/Svelte,
collaboration, Firefox, direct codemod, and a mandatory `chrome.debugger`. See
[Vision-Control-PRD.md](./Vision-Control-PRD.md) sections 7.2 and 7.3.

For the full feature list and limitations, see
[docs/release-notes-v0.1.0.md](./docs/release-notes-v0.1.0.md).

---

## Monorepo layout

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

See [PRD section 20.2](./Vision-Control-PRD.md) for the authoritative directory
tree and [PRD section 20.3](./Vision-Control-PRD.md) for package boundary rules.

---

## Architecture decisions

Every significant decision is recorded as an Architecture Decision Record under
[docs/adr/](./docs/adr/). Start with
[ADR-001](./docs/adr/ADR-001-toolchain.md) for the toolchain rationale, then
read in order. Each ADR has an MVP Guardrail section that explains what the
decision protects against and which V1 or V2 features it deliberately excludes.

---

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup, commit
conventions, the package generator, and the PR checklist.

If you are an AI coding agent working in this repo, read
[AGENTS.md](./AGENTS.md) first. It covers the hard guardrails: no source-mutating
MCP tools, no production source markers, no V1 features beyond stubs.

## Troubleshooting and docs

- Problems installing, building, or connecting? See
  [docs/troubleshooting.md](./docs/troubleshooting.md).
- Security and privacy posture: [docs/security-privacy-overview.md](./docs/security-privacy-overview.md).
- MCP server setup for OpenCode / Claude Code / generic stdio + HTTP:
  [docs/mcp-config-examples.md](./docs/mcp-config-examples.md).
- Generated protocol JSON Schema: [docs/json-schemas/protocol-envelope.json](./docs/json-schemas/protocol-envelope.json).
- Architecture decisions: [docs/adr/](./docs/adr/). Agent-facing engineering
  contracts: [docs/agents/](./docs/agents/).
