# Generators

Each generator lives in its own folder with a `schema.json` (the `nx g` schema)
and a `generator.ts` (a factory that returns the generated file list via the
shared `generatePackageFiles` core).

## Folder layout

```
src/generators/
  index.ts                       # factory functions + GeneratorOverrides type
  generators.test.ts             # unit tests for every generator kind
  vision-package/      schema.json + generator.ts
  browser-package/     schema.json + generator.ts
  node-package/        schema.json + generator.ts
  integration-package/ schema.json + generator.ts
  fixture-app/         schema.json + generator.ts
```

## Canonical invocation

The bulk scaffold target is the canonical way packages are created in this
workspace:

```bash
pnpm nx run tools-nx-plugin:scaffold
```

It runs the manifest in `src/scripts/scaffold-all.ts`, which calls each factory
(`visionPackage`, `browserPackage`, `nodePackage`, `integrationPackage`,
`fixtureApp`) and writes the resulting files. Adding a package = adding one line
to the manifest + re-running `scaffold`.

Wiring these factories into `nx g @vision-control/nx-plugin:<name>` would require
adding `@nx/devkit` as a real dependency and a `Tree`-based entry point; that is
deferred (out of MVP scope) because the pure-function core already provides
reproducible scaffolding.
