# Package Boundaries

This guide explains the package boundary rules, how the checker works, and how to
add a new package without breaking isolation.

Related: [ADR-003](../adr/ADR-003-package-boundaries.md),
[CONTRIBUTING.md](../../CONTRIBUTING.md).

---

## Tags

Every package declares tags in `project.json#tags`. The boundary checker reads
them.

| Tag | Meaning |
|---|---|
| `platform:browser` | Runs in the extension or page context. Can touch DOM globals. |
| `platform:node` | Runs in the daemon or CLI. Has filesystem and network access. |
| `platform:isomorphic` | Runs anywhere. No platform-specific globals. |
| `type:library` | A reusable library package. |
| `type:app` | A runnable application (extension, daemon, playground). |
| `type:integration` | A build integration (Vite plugin, Next plugin). |
| `type:fixture` | A fixture app for testing. |
| `scope:<name>` | Project-graph organization tag. |

---

## The two enforced rules

The checker (`tools/nx-plugin/src/scripts/boundaries.ts`, run via
`pnpm boundaries`) enforces exactly two rules. It scans every `.ts` and `.tsx`
file under each package's `src/` directory.

### Rule 1: node must not import browser

A `platform:node` package must not import a `platform:browser` package.

**Illegal:**
```ts
// In apps/daemon (platform:node)
import { SelectionOverlay } from "@vision-control/overlay-ui"; // platform:browser
```

This fails the check because a Node bundle would pull DOM-dependent code into the
daemon.

**Legal:**
```ts
// In packages/daemon-client (platform:isomorphic)
import type { ChangeMessage } from "@vision-control/protocol"; // platform:isomorphic
```

### Rule 2: no deep imports

No package may import another package's `src/` directory. Use the public package
export only.

**Illegal:**
```ts
import { internalHelper } from "@vision-control/protocol/src/internal";
```

**Legal:**
```ts
import { publicApi } from "@vision-control/protocol";
```

---

## Platform classification

### Browser-only packages

`overlay-ui`, `inspector-core`, `editor-core`, `preview-engine`

These touch DOM globals, browser APIs, or React. They are tagged
`platform:browser`.

### Node-only packages

`workspace-index`, `daemon-core`, `storage`, `mcp-server`, `cli`

These touch the filesystem, the network, or Node built-ins. They are tagged
`platform:node`.

### Isomorphic packages

`protocol`, `change-ir`, `geometry` (DOM-independent types and math),
`context-compiler` (schema layer), `logger` (interface)

These have no platform-specific dependencies. They are tagged
`platform:isomorphic`.

---

## Running the checker

```bash
pnpm boundaries
```

The checker discovers all packages by scanning `apps/*`, `packages/*`,
`integrations/*`, and `tools/*` for `project.json`. It reads the tags, builds a
platform map, then walks every `.ts` and `.tsx` file in each package's `src/`.

Output on success:
```
vision-control boundary check
  packages: 29
  source files scanned: 69
  result: PASS (no boundary violations)
```

Output on failure lists the violating file, the rule, and the offending import.

### Test fixture gotcha

The checker scans test files too. If a test contains a forbidden import as string
data (for example, asserting that deep imports are caught), the checker will flag
it. Fragment the string so it is not parseable as an import:

```ts
// Bad: the checker sees this as a real import
const spec = "@vision-control/beta/src/internal";

// Good: fragmented, not parseable
const spec = "@vision-control/beta/" + "src/internal";
```

---

## Adding a new package

1. Add an entry to the manifest in
   `tools/nx-plugin/src/scripts/scaffold-all.ts`.
2. Run `pnpm nx run tools-nx-plugin:scaffold`. This writes the full skeleton:
   `package.json`, `project.json` (with tags), `tsconfig.json`,
   `tsconfig.build.json`, `vitest.config.ts`, `src/index.ts`, and a trivial test.
3. If the package needs different platform tags, edit `project.json#tags` after
   scaffolding. The checker reads tags from there, so re-tagging changes
   enforcement with no code change.
4. Run `pnpm boundaries` to confirm the new package is clean.

The generator is a pure function. It does not use `@nx/devkit`. See ADR-003 and
decision D8 for the rationale.

---

## Deferred enforcement

The browser-to-node direction is not yet enforced. Only node-to-browser is
checked. This means a browser package could theoretically import a node package
without triggering the checker. This is an observation, not a blocker: real
cross-imports in that direction have not appeared yet. Adding the rule is trivial
when they do. See decision D10.

`preview-engine` and `storage` are tagged `platform:isomorphic` at scaffold time.
PRD section 20.3 classifies them as browser-only and node-only respectively. A
later task can tighten these tags. See decision D11.
