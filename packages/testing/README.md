# @vision-control/testing

Shared testing harness for the Vision-Control monorepo. Test-context only
(consumed by `*.test.ts` / `*.e2e.ts` files); the barrel re-exports Vitest
helpers so importing it pulls in `vitest` at runtime.

> Nx tags: platform:isomorphic, type:library, scope:testing.

## What it provides

- **Evidence writer** (`writeEvidence`, `appendEvidence`, `evidenceFilePath`) —
  deterministic `.omo/evidence/task-<N>(-vision-control-mvp|-<suffix>).md`
  output for plan QA. Idempotent in write mode; append mode for accumulation.
- **`FakeClock`** — injectable deterministic clock (`now()`, `tick(ms)`,
  `setNow(ms)`, `reset()`). Standalone; does not wrap `vi.useFakeTimers`.
- **`FakeUuidSequencer`** — deterministic zero-padded ids (`uuid-0001`, ...).
- **Fixture builders** — `buildRecord`, `buildChangeset`, `buildSelectionIdentity`
  with forward-looking shapes (real schemas land in later tasks).
- **Playwright extension loader** (`buildExtensionLaunchArgs`, `loadExtension`,
  `withExtensionContext`) — builds the canonical Chromium args for loading an
  unpacked extension and wraps the browser lifecycle.
- **Vitest preset** (`vcTestConfig`, `vcTestSetup`, `bindSharedClock`,
  `bindSharedUuid`) — config preset + opt-in shared-instance reset between tests.

## Product-path note

The extension owns selection, preview, and tab-journal state. Ordinary editing
and panel context export do not require a Node process. The optional
single-process MCP bridge is a read-only projection and coordination path for a
paired coding agent; it never applies source changes.

## Playwright note (important)

`playwright` is a devDependency of this package (pinned via the catalog at
`1.61.1`). This task does NOT run `playwright install` — the browser binaries
(~200MB) are installed by the CI workflow only when e2e-relevant files change.

Calling `loadExtension` / `withExtensionContext` without the Chromium binary
installed will fail at launch time. For local e2e development, run:

```bash
pnpm exec playwright install --with-deps chromium
```

Chrome extensions cannot run in the legacy headless shell. `loadExtension`
defaults to `headless: false` (headed). Use `headless: true` only with a
Playwright that defaults to the new headless mode.

## Scripts

Run from the repository root:

```bash
pnpm build                 # tsc -p tsconfig.build.json -> dist/
pnpm typecheck             # tsc --noEmit -p tsconfig.json
pnpm test                  # vitest run
pnpm nx run testing:test   # run this package's tests directly
```
