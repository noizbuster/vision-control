# Vision Control v0.1.0 — MVP Release Notes

**Tag:** `v0.1.0`
**Status:** Minimum Viable Product. All packages synchronized to `0.1.0`.

Vision Control turns visual editing of a live web page into structured
source-change intent. This release delivers the full MVP scope: a Chromium
DevTools panel, an authenticated loopback daemon, reversible runtime previews, a
redacted context export, and a read-only MCP server — with the hard guarantee
that **a visual edit is a preview, never a silent source change**.

---

## What works in v0.1.0

### Extension (Chromium DevTools panel)

- Shadow-DOM overlay with hover/selection outlines, keyboard navigation, and a
  pointer-ownership state machine (one drag/resize at a time).
- Inspector: breadcrumb, computed style, box model, class list, attributes,
  semantic summary, sibling summary, and source confidence.
- Editors for style (CSS property allowlist), class (add/remove/replace), and
  text. Commands carry a `runtime` flag distinguishing preview mutations from
  source intent.
- Message routing with per-tab/per-frame session isolation; cross-origin frames
  are opaque and never receive edit messages.
- Loopback-only host permissions; `debugger` is optional only.
- Built with WXT 0.20 + React 19 (MV3).

### Daemon and persistence

- Authenticated loopback WebSocket service. Binds to `127.0.0.1` only; non-loopback
  hosts refused.
- Two-token model: a pairing token (32 bytes, shown once, stored as SHA-256 hash)
  authenticates the upgrade; origin allowlist enforced first.
- SQLite persistence via `better-sqlite3`: sessions, changesets, source registry,
  and an append-only audit log. Restart restores persisted state.
- `vision-control.config.ts` loaded with Node native type-stripping; Zod-validated.

### Editing model and previews

- A change IR with 8 operation kinds and computed inverses (undo/redo journal).
  Each operation carries `runtime: boolean` so a preview mutation is never
  mistaken for source intent.
- Reversible preview engine: style/class/text/structural previews applied as
  transactions with rollback and a reconciliation observer that detects when React
  restores the original DOM.
- Semantic resize (flex-basis/grow/shrink for flex items; width/height otherwise)
  and guarded reparent (content-model validation; normal-flow drag never collapses
  to absolute positioning — PRD constraint 2).

### Source markers and resolution

- Dev-only, opaque `data-vc-source` markers injected by a Vite + React plugin.
  Production builds are left untouched; absolute paths rejected at two layers.
- Source registry, resolver (priority cascade that never returns a wrong HIGH),
  and a workspace file index. CSS class-token scanning is supported; Tailwind and
  CSS Modules are V1 stubs.

### Context export

- Compiled agent context (JSON or Markdown) with deny-by-default redaction, a
  privacy report, and a token-budget truncation that preserves high-priority
  sections.

### Verification

- HMR assertion engine that proves the source-patched runtime state matches the
  preview, with rollback-on-mismatch and specificity-conflict diagnostics.

### MCP server (read-only)

- 7 read tools (active session, selection, changeset, source context,
  verification plan, diagnostics, element capture) and 4 coordination signals
  (request verification, clear preview, mark patch started/completed).
- **stdio** and **loopback HTTP** transports. HTTP binds to `127.0.0.1` only and
  requires a Bearer token + allowed origin.
- No source-changing tool exists. Built on `@modelcontextprotocol/sdk` 1.29.

### CLI

- `vision-control` binary: `daemon`, `status`, `sessions list`, `context current`,
  `changes current`, `verify current`, `preview clear`, `doctor`, `help`.
- `doctor` runs nine checks: install, boundaries, typecheck, test, build,
  daemon-binary, daemon-reachable, mcp, playground.

### Toolchain

- pnpm 11.9.0 workspaces + Nx 23 + Biome 2.5 (single formatter/linter).
- TypeScript 6 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`). Vitest 4. Zod 4.
- 29 packages with enforced platform boundaries (`platform:browser` / `node` /
  `isomorphic`) and a no-deep-import rule.
- 10 ADRs, each with an MVP Guardrail section.

---

## Getting started

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check && pnpm typecheck && pnpm test && pnpm build && pnpm boundaries
```

Build the runnable artifacts:

```bash
pnpm nx run extension:build    # -> apps/extension/.output/chrome-mv3/
pnpm nx run cli:build          # -> packages/cli/dist/bin.js
pnpm nx run mcp-server:build   # -> packages/mcp-server/dist/bin.js
pnpm nx run daemon:dev         # build + run the daemon
```

Load the extension from `apps/extension/.output/chrome-mv3/` in Chromium, then
open the **Vision Control** DevTools panel on a loopback page. See the root
[README.md](../README.md) for the full quick start and the
[docs/](./) directory for configuration, troubleshooting, and security.

---

## Security posture (summary)

- Loopback daemon, origin allowlist, hashed pairing tokens, constant-time token
  comparison.
- Dev-only opaque source markers; no filesystem paths in the DOM; production
  builds untouched.
- Deny-by-default redaction on every export; no unredacted path.
- Read-only MCP; no tool writes source.
- See [security-privacy-overview.md](./security-privacy-overview.md).

---

## Explicitly out of scope (V1 / V2)

Multi-select and group move, Auto Layout, CSS Grid reorder, Tailwind
token-aware editing, CSS Modules source mapping, Next.js / Vue / Svelte, real
time collaboration, Firefox support, direct codemod application, and a
mandatory `chrome.debugger` permission. These are deferred per PRD sections 7.2
and 7.3.

---

## Known limitations

- The Tailwind and CSS Modules resolvers are stubs that return an "unsupported"
  diagnostic.
- CSS class-token scanning is line-based (see task notes); multi-line selectors
  ending in `,` before the brace may under-capture.
- Screenshots are deferred; the MVP exports structured text context only.
- This is a local development tool; no packages are published to a registry and
  the extension is not on a browser store.
