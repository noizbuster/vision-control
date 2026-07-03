# ADR-003: Package boundary tags and the boundary checker

## Status

Accepted (2026-07-02).

## Context

The workspace has 29 packages across browser, node, and isomorphic contexts
(PRD section 20.3, lines 1441-1478). Without enforcement, a Node package could
accidentally import a browser-only package (pulling DOM globals into the daemon
bundle) or a consumer could deep-import another package's internal modules,
breaking encapsulation.

The PRD requires a custom conformance check (line 1478) because Nx module
boundary rules require `@nx/devkit`, which is not cleanly importable in this
workspace (it is bundled inside `nx` and not exposed via `exports`). See decision
D8 and D10.

## Decision

Every package declares tags in `project.json#tags`:

- A `platform:*` tag: `platform:browser`, `platform:node`, or
  `platform:isomorphic`
- A `type:*` tag: `type:library`, `type:app`, `type:integration`, or
  `type:fixture`
- A `scope:<name>` tag for project-graph organization

The boundary checker (`tools/nx-plugin/src/scripts/boundaries.ts`, exposed as
`pnpm boundaries`) enforces exactly two rules:

1. **node-imports-browser**: a `platform:node` package must not import a
   `platform:browser` package.
2. **deep-import**: no package may import `@vision-control/<name>/src/*`. Use
   the public package export (`@vision-control/<name>`) only.

The checker scans every `.ts` and `.tsx` file under each package's `src/`,
extracts import specifiers via regex, and checks them against the tag-derived
platform maps. Enforcement is tag-driven: re-tagging a package changes behavior
with no code change.

The package generator is a pure function `(opts) -> GeneratedFile[]` with no
`@nx/devkit` dependency. It writes a file plan to disk. Generators are invoked
through `pnpm nx run tools-nx-plugin:scaffold`, not `nx g`.

## Consequences

- Re-tagging a package from `isomorphic` to `browser` or `node` is a one-line
  change in `project.json` that immediately tightens enforcement.
- The checker scans test files too. Test fixtures that contain forbidden import
  literals as data must fragment the string (for example
  `"@vision-control/beta/" + "src/internal"`) to avoid false positives.
- The browser-to-node direction is not yet enforced (only node-to-browser is).
  This is an observation, not a blocker: adding it as a third rule is trivial
  when real cross-imports appear. See decision D10.
- `preview-engine` and `storage` are tagged `platform:isomorphic` at scaffold
  time even though PRD section 20.3 classifies them browser-only and node-only
  respectively. A later task can tighten these tags with zero checker change.
  See decision D11.

## MVP Guardrail

The boundary checker enforces the browser/node split that keeps the daemon bundle
clean of DOM code and the extension bundle clean of Node code. This protects the
MVP's core architectural promise: the extension runs in the browser, the daemon
runs on loopback, and neither leaks into the other's runtime. The tag-driven
design means scope decisions can evolve without rewriting the checker, which
prevents the enforcement logic from becoming a maintenance burden during MVP.

## Correction Notes

- **Package count (2026-07-04).** The Context section says "29 packages". That
  was the early scaffold snapshot; the workspace now has 40 packages and
  `pnpm boundaries` reports `packages: 40`. The 29 figure is retained for
  history.
- **`editor-core` retagged browser (2026-07-04).** PRD section 20.3 classifies
  `editor-core` as Browser-only, but it was scaffolded `platform:isomorphic`
  (the same deferred-tag pattern noted above for `preview-engine` and
  `storage`). `editor-core` has now been tightened to `platform:browser`, the
  one-line `project.json` change this ADR's Consequences section describes.
  `pnpm boundaries` still passes: `editor-core` is imported only by browser
  packages (`overlay-ui`, the extension app) and the isomorphic
  `interaction-machine` (isomorphic → browser is allowed; only node → browser
  is forbidden). No node package imports it. `preview-engine` and `storage`
  remain on the deferred isomorphic tag.
