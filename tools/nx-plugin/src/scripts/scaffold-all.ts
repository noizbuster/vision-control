/**
 * Bulk-scaffolds every MVP-relevant package/app/integration from the generator
 * core. Run via `pnpm nx run tools-nx-plugin:scaffold` (which builds the plugin
 * first and then executes the compiled `dist/scripts/scaffold-all.js`).
 *
 * The manifest below is the single, declarative source of which packages exist
 * and how they are tagged. Adding a package means adding one line here and
 * re-running the target; the generator guarantees identical, consistent project
 * metadata across the workspace.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratePackageOptions } from "../core/generate-package-files.js";
import { generatePackageFiles } from "../core/generate-package-files.js";
import {
  browserPackage,
  fixtureApp,
  integrationPackage,
  nodePackage,
  visionPackage,
} from "../generators/index.js";

const iso = (name: string): GeneratePackageOptions => visionPackage(name, `packages/${name}`);
const browser = (name: string): GeneratePackageOptions => browserPackage(name, `packages/${name}`);

const manifest: readonly GeneratePackageOptions[] = [
  // Isomorphic libraries (platform:isomorphic, type:library)
  iso("protocol"),
  iso("change-ir"),
  iso("change-journal"),
  iso("element-identity"),
  iso("geometry"),
  iso("interaction-machine"),
  iso("layout-engine"),
  iso("preview-engine"),
  iso("source-registry"),
  iso("source-resolver"),
  iso("workspace-index"),
  iso("context-compiler"),
  iso("verification-engine"),
  iso("daemon-core"),
  iso("daemon-client"),
  iso("mcp-server"),
  iso("security"),
  iso("storage"),
  iso("logger"),
  iso("testing"),
  iso("editor-core"),
  // Browser libraries (platform:browser, type:library)
  browser("overlay-ui"),
  browser("inspector-core"),
  browser("shared-ui"),
  // Node library (platform:node, type:library)
  nodePackage("cli", "packages/cli"),
  // Node app (platform:node, type:app)
  nodePackage("daemon", "apps/daemon", { type: "app" }),
  // Browser app (platform:browser, type:app)
  browserPackage("extension", "apps/extension", { type: "app" }),
  // Fixture apps (platform:browser, type:fixture)
  fixtureApp("playground-react-vite", "apps/playground-react-vite"),
  fixtureApp("playground-next", "apps/playground-next"),
  fixtureApp("visual-regression-lab", "apps/visual-regression-lab"),
  // Build-tool integrations (platform:node, type:integration)
  integrationPackage("vite-react", "integrations/vite-react"),
  integrationPackage("next-react", "integrations/next-react"),
  integrationPackage("tailwind", "integrations/tailwind"),
  integrationPackage("css-modules", "integrations/css-modules"),
  integrationPackage("vue", "integrations/vue"),
  integrationPackage("svelte", "integrations/svelte"),
  integrationPackage("opencode", "integrations/opencode"),
  integrationPackage("pi", "integrations/pi"),
];

const findRepoRoot = (start: string): string => {
  let dir = start;
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repo root (pnpm-workspace.yaml) from ${start}`);
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(here);

let created = 0;
let updated = 0;

for (const opts of manifest) {
  const files = generatePackageFiles(opts);
  for (const file of files) {
    const abs = path.join(repoRoot, file.path);
    const existed = existsSync(abs);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, file.content);
    if (existed) {
      updated += 1;
    } else {
      created += 1;
    }
  }
}

const report = [
  `vision-control scaffold complete`,
  `  packages generated: ${manifest.length}`,
  `  files created: ${created}`,
  `  files updated: ${updated}`,
  `  repo root: ${repoRoot}`,
].join("\n");
console.log(report);
