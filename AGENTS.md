# AGENTS.md

This file is the brief for AI coding agents working in the Vision Control
repository. Read it before writing any code. It tells you what the project is,
where the boundaries are, and what you must never do.

Human contributors should read [CONTRIBUTING.md](./CONTRIBUTING.md) instead.

---

## What this project is

Vision Control turns visual editing of a live web page into structured
source-change intent. A Chromium DevTools panel lets you pick an element,
inspect it, and issue edit commands. The runtime previews edits in the browser.
A local daemon and a read-only MCP server give a coding agent the context it
needs to understand the page and verify its work.

The runtime preview is not a source change. That distinction is the backbone of
every guardrail below.

Full product scope: [Vision-Control-PRD.md](./Vision-Control-PRD.md).

---

## Package boundaries

The workspace has 29 packages split across `apps/`, `packages/`,
`integrations/`, and `tools/`. Every package carries Nx tags in its
`project.json` that declare its platform and type:

- `platform:browser` - runs in the extension or page context
- `platform:node` - runs in the daemon or CLI
- `platform:isomorphic` - runs anywhere
- `type:library`, `type:app`, `type:integration`, `type:fixture`

Two rules are enforced by the boundary checker:

1. A `platform:node` package must not import a `platform:browser` package.
2. No package may deep-import another package's `src/` directory. Use the
   package public API (`@vision-control/<name>`) only.

Run `pnpm boundaries` to check. The checker scans every `.ts` and `.tsx` file
under each package's `src/`.

Full rules and examples: [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md).

---

## MUST do

- Run `pnpm check`, `pnpm typecheck`, and `pnpm test` before claiming a task is
  done. `pnpm build` too if you changed compilable code.
- Read the relevant ADRs under [docs/adr/](./docs/adr/) before changing
  architecture. If your change contradicts an ADR, raise it, do not silently
  override.
- Add types for every public API. Export from `src/index.ts` only what consumers
  need. No `any` in public signatures.
- Write evidence under `.omo/evidence/task-<N>-*.md` for every plan task.
  Capture real command output, not summaries.
- Follow conventional commits with the scopes listed in
  [CONTRIBUTING.md](./CONTRIBUTING.md).

## MUST NOT do

These are hard guardrails. Violating them breaks the project contract.

- **Do not add source-mutating MCP tools.** The MCP server exposes read-only
  tools only. There is no `vision_apply_deterministic_patch` and there will not
  be one in the MVP. See
  [docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md).
- **Do not inject source markers into production builds.** Markers are a dev-only
  build artifact. They must never ship to a production bundle. See ADR-008 and
  [docs/agents/security-privacy.md](./docs/agents/security-privacy.md).
- **Do not require `chrome.debugger`.** The extension works without the debugger
  permission for the MVP scope. It is optional, not mandatory.
- **Do not implement V1 or V2 features.** The MVP scope is fixed. Multi-select,
  group move, Auto Layout, CSS Grid reorder, Tailwind token-aware editing, CSS
  Modules mapping, Next.js, Vue, Svelte, collaboration, Firefox, direct codemod,
  and mandatory `chrome.debugger` are all out of scope. See PRD section 7.2 and
  7.3.
- **Do not treat runtime preview mutation as a source change.** Visual edits
  live in the preview layer until an agent or human applies a real patch.
- **Do not auto-convert normal-flow drag to absolute positioning.** This is PRD
  constraint 2.
- **Do not add a second formatter or linter.** Biome is the only one. No ESLint,
  no Prettier, no Stylelint. See ADR-001.
- **Do not break package boundaries.** Browser packages must not depend on Node
  packages and vice versa. No deep imports into `src/`.
- **Do not use `--dry-run` output as verification evidence.** Run the real
  command and capture real output. See
  [docs/agents/verification.md](./docs/agents/verification.md).
- **Do not pass preview-cleared checks off as source verification.** A preview
  that renders correctly does not prove the source changed. The verification
  loop must assert on the actual source after HMR.

---

## Where to find things

| Need | Look at |
|---|---|
| Product scope and architecture | [Vision-Control-PRD.md](./Vision-Control-PRD.md) |
| Architecture decisions | [docs/adr/](./docs/adr/) |
| Package boundary rules | [docs/agents/package-boundaries.md](./docs/agents/package-boundaries.md) |
| Security and privacy contract | [docs/agents/security-privacy.md](./docs/agents/security-privacy.md) |
| Verification and evidence rules | [docs/agents/verification.md](./docs/agents/verification.md) |
| MCP read-only policy | [docs/agents/mcp-policy.md](./docs/agents/mcp-policy.md) |
| Development setup and commits | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Root scripts | [package.json](./package.json) |

---

## Verification commands

Before declaring a task complete, run these and capture the output into the
evidence file:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm boundaries
```

If your change touches e2e, also run `pnpm test:e2e`.
