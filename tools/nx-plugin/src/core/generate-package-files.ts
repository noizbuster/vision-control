/**
 * Single source of truth for package-skeleton generation.
 *
 * Every Nx generator in this plugin (vision-package, browser-package,
 * node-package, integration-package, fixture-app) delegates to
 * {@link generatePackageFiles}. There is intentionally no `@nx/devkit` Tree
 * dependency: the function is a pure `(opts) -> GeneratedFile[]` so the same
 * code drives both the `nx g`-style factories and the bulk
 * `tools-nx-plugin:scaffold` target. This keeps scaffolding reproducible and
 * makes the generators unit-testable without a workspace Tree.
 */

export type Platform = "isomorphic" | "browser" | "node";

export type ProjectType = "library" | "app" | "integration" | "fixture";

export interface GeneratePackageOptions {
  /** Directory name (last path segment), e.g. "protocol", "playground-react-vite". */
  readonly name: string;
  /** Repo-root-relative directory, e.g. "packages/protocol", "apps/daemon". */
  readonly directory: string;
  readonly platform: Platform;
  readonly type: ProjectType;
  /** Short human description used in package.json + README. */
  readonly description: string;
  /** `scope:<x>` tag value. Defaults to {@link GeneratePackageOptions.name}. */
  readonly scope?: string;
}

export interface GeneratedFile {
  /** Repo-root-relative output path. */
  readonly path: string;
  readonly content: string;
}

export const ORG = "@vision-control";

/** Canonical package name for a directory name, e.g. "protocol" -> "@vision-control/protocol". */
export const packageNameFor = (name: string): string => `${ORG}/${name}`;

const SENTINEL_CONST = "PACKAGE_NAME";

const toPosix = (p: string): string => p.split("\\").join("/");

const tagsFor = (opts: GeneratePackageOptions): readonly string[] => [
  `platform:${opts.platform}`,
  `type:${opts.type}`,
  `scope:${opts.scope ?? opts.name}`,
];

const packageName = (opts: GeneratePackageOptions): string => packageNameFor(opts.name);

const jsonStr = (value: string): string => JSON.stringify(value);

// Emitters hand-author the Biome-canonical layout (primitive arrays collapsed
// inline; package.json `files` expanded to match Biome's package.json handling)
// so scaffold output passes `pnpm check` without a separate format step. Do not
// "simplify" to JSON.stringify — it would expand single-element arrays and fail.

const packageJson = (opts: GeneratePackageOptions): string => `{
  "name": ${jsonStr(packageName(opts))},
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": ${jsonStr(opts.description)},
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
`;

const projectJson = (opts: GeneratePackageOptions): string => {
  const tags = tagsFor(opts)
    .map((t) => jsonStr(t))
    .join(", ");
  const projectType = opts.type === "app" ? "application" : "library";
  const cwd = jsonStr(opts.directory);
  return `{
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "name": ${jsonStr(opts.name)},
  "sourceRoot": ${jsonStr(toPosix(`${opts.directory}/src`))},
  "projectType": ${jsonStr(projectType)},
  "tags": [${tags}],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc -p tsconfig.build.json",
        "cwd": ${cwd}
      },
      "outputs": ["{projectRoot}/dist"]
    },
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p tsconfig.json",
        "cwd": ${cwd}
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "options": {
        "command": "vitest run",
        "cwd": ${cwd}
      }
    }
  }
}
`;
};

const tsconfigJson = (): string => `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "noEmit": false
  },
  "include": ["src"]
}
`;

const tsconfigBuildJson = (): string => `{
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts", "src/**/*.spec.ts", "src/**/*.test.tsx", "src/**/*.spec.tsx"]
}
`;

const vitestConfig = (): string =>
  `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
`;

const srcIndex = (opts: GeneratePackageOptions): string =>
  `export const ${SENTINEL_CONST} = "${packageName(opts)}";
`;

const srcIndexTest = (opts: GeneratePackageOptions): string =>
  `import { describe, expect, it } from "vitest";

import { ${SENTINEL_CONST} } from "./index.js";

describe("${opts.name}", () => {
  it("exposes the package name sentinel", () => {
    expect(${SENTINEL_CONST}).toBe("${packageName(opts)}");
  });
});
`;

const readme = (opts: GeneratePackageOptions): string =>
  `# ${packageName(opts)}

${opts.description}

> Skeleton generated by \`@vision-control/nx-plugin\` (${opts.platform}/${opts.type}).
> Nx tags: ${tagsFor(opts).join(", ")}.

## Scripts

Run from the repository root:

\`\`\`bash
pnpm build        # tsc -p tsconfig.build.json -> dist/
pnpm typecheck    # tsc --noEmit -p tsconfig.json
pnpm test         # vitest run
\`\`\`
`;

/**
 * Returns every file that constitutes a generated package skeleton, with
 * repo-root-relative paths. Pure and side-effect free.
 */
export const generatePackageFiles = (opts: GeneratePackageOptions): readonly GeneratedFile[] => {
  const dir = toPosix(opts.directory);
  return [
    { path: `${dir}/package.json`, content: packageJson(opts) },
    { path: `${dir}/project.json`, content: projectJson(opts) },
    { path: `${dir}/tsconfig.json`, content: tsconfigJson() },
    { path: `${dir}/tsconfig.build.json`, content: tsconfigBuildJson() },
    { path: `${dir}/vitest.config.ts`, content: vitestConfig() },
    { path: `${dir}/README.md`, content: readme(opts) },
    { path: `${dir}/src/index.ts`, content: srcIndex(opts) },
    { path: `${dir}/src/index.test.ts`, content: srcIndexTest(opts) },
  ];
};

export const GENERATED_FILE_NAMES = [
  "package.json",
  "project.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "vitest.config.ts",
  "README.md",
  "src/index.ts",
  "src/index.test.ts",
] as const;
