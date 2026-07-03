# Migrating from v0.1.0 to v0.2.0

v0.2.0 is backward compatible with v0.1.0 at the data and protocol level. This
guide covers what changed, what to update, and what to watch for.

## TL;DR

- The protocol version bumped `1.0.0` -> `1.1.0` (additive minor). A v1.0.0 client
  works against a v1.1.0 server; a v1.1.0 client against a v1.0.0 server is
  rejected (server too old).
- The change IR gained 14 V1 operation kinds. Existing MVP operations are
  unchanged; `computeInverse` and the exhaustive switches were extended.
- Storage gained two migrations (009 V1 operations, 010 share bundles). Both are
  additive `ALTER TABLE` / new-table; existing rows are untouched.
- No breaking API change to read-only MCP tools. One tool gained an optional
  `format` parameter.

## Protocol

`PROTOCOL_VERSION` is now `1.1.0`. The envelope/message Zod schemas match the
version pattern, not a literal, so wire compatibility is unchanged. Negotiation:
`hasCompatibleMajor` (loose) accepts any 1.x; `isCompatible` (strict) requires
`server.minor >= client.minor`. Action: if you run a v1.0.0 daemon, upgrade it
before connecting a v1.1.0 panel/CLI.

## Change IR

14 V1 operation kinds were added: `multi-select-group`, `group-reorder`,
`group-reparent`, `align-elements`, `distribute-elements`, `set-container-layout`,
`set-child-sizing`, `grid-reorder`, `grid-span`, `breakpoint-style-edit`,
`breakpoint-class-edit`, `breakpoint-text-edit`, `screenshot-crop-ref`,
`suggested-diff`. Each state-changing kind captures prior state for a lossless
inverse. `screenshot-crop-ref` and `suggested-diff` are metadata/inert (no source
state). MVP operations (`style-edit`, `class-replace`, `text-edit`, `reorder-child`,
`reparent`, `resize`, `multi-select-group`-precursor) are unchanged.

Action: if you persisted or replayed changesets, old changesets deserialize
unchanged. New kinds are additive.

## Storage

Two additive migrations:

- `009-v1-operations.sql` — nullable columns for breakpoint / suggested-diff /
  multi-select metadata, plus a new `screenshot_artifacts` table.
- `010-share-bundles.sql` — `share_bundles` table for local export/import audit.

Both run automatically on daemon start. Existing rows are untouched. Action: none
required; the migrator discovers new files.

## MCP server

`vision_get_source_context` now accepts an optional `format: "json" | "markdown"`
(default `json`). Old callers omitting `format` behave exactly as before. No new
tool was added; no tool was removed or renamed. The tool list is still 11
read-only tools. Action: none required.

## Extension

- New build target: `pnpm nx run extension:build:firefox` produces a Firefox MV2
  build at `.output/firefox-mv2/`. The Chromium build is unchanged.
- The `wxt.config.ts` declares the shared manifest (loopback hosts, optional
  debugger) and suppresses the Firefox data-collection prompt (VC collects no
  data).
- New e2e spec: `firefox-compat.spec.ts` validates the Firefox manifest security
  posture. Run with `pnpm nx run extension:e2e --grep "firefox-compat"`.

Action: if you load the extension manually, the Chromium load steps are
unchanged. For Firefox, load `.output/firefox-mv2/` via `about:debugging`.

## Source resolution adapters

The V1 adapter re-exports (`TAILWIND_TOKEN_ADAPTER`, `CSS_MODULES_ADAPTER`,
`NEXT_ADAPTER`, `VUE_ADAPTER`, `SVELTE_ADAPTER`, `CSS_IN_JS_ADAPTER`,
`VANILLA_CSS_ADAPTER`) replace the v0.1.0 stubs. `V1_NOT_IMPLEMENTED_ADAPTERS` is
now empty. Callers that checked for "not-yet-implemented" warnings will no longer
see them for these frameworks. Action: none required; adapters return real
candidates with honest confidence.

## CLI

New `codemod` subcommand: `vision-control codemod preview|apply <suggestion-id>`.
This is a local action outside the MCP server. Existing commands
(`daemon`, `status`, `sessions`, `context`, `changes`, `verify`, `preview`,
`doctor`) are unchanged. Action: none required.

## What to verify after upgrading

1. `pnpm install --frozen-lockfile` (lockfile updated with new importer sections).
2. `pnpm check && pnpm typecheck && pnpm test && pnpm build && pnpm boundaries`.
3. `pnpm nx run extension:build:firefox` produces a valid Firefox build.
4. The daemon starts and runs migrations 009 + 010.
5. An existing changeset from v0.1.0 still deserializes and round-trips.

See [release-notes-v0.2.0.md](./release-notes-v0.2.0.md) for the full feature
list and [known-limitations.md](./known-limitations.md) for scope boundaries.
