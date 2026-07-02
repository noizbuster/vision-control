import type {
  GeneratePackageOptions,
  Platform,
  ProjectType,
} from "../core/generate-package-files.js";

/**
 * Per-generator override surface. Every generator factory merges these partial
 * values over its platform/type defaults, so callers only override what differs.
 */
export interface GeneratorOverrides {
  readonly description?: string;
  readonly scope?: string;
  /**
   * Optional type override for generators that can produce more than one shape
   * (e.g. `node-package` scaffolds both the `cli` library and the `daemon` app).
   */
  readonly type?: ProjectType;
}

const buildOptions = (
  name: string,
  directory: string,
  platform: Platform,
  defaultType: ProjectType,
  defaultDescription: string,
  overrides: GeneratorOverrides = {},
): GeneratePackageOptions => {
  const base: GeneratePackageOptions = {
    name,
    directory,
    platform,
    type: overrides.type ?? defaultType,
    description: overrides.description ?? defaultDescription,
  };
  return overrides.scope === undefined ? base : { ...base, scope: overrides.scope };
};

/**
 * Isomorphic library skeleton (`platform:isomorphic`, `type:library`).
 * Consumable from both browser bundles and Node processes.
 */
export const visionPackage = (
  name: string,
  directory: string,
  overrides?: GeneratorOverrides,
): GeneratePackageOptions =>
  buildOptions(
    name,
    directory,
    "isomorphic",
    "library",
    `Isomorphic library skeleton for @vision-control/${name}.`,
    overrides,
  );

/**
 * Browser library/app skeleton (`platform:browser`).
 * Defaults to `type:library`; pass `{ type: "app" }` for browser apps.
 */
export const browserPackage = (
  name: string,
  directory: string,
  overrides?: GeneratorOverrides,
): GeneratePackageOptions =>
  buildOptions(
    name,
    directory,
    "browser",
    "library",
    `Browser library skeleton for @vision-control/${name}.`,
    overrides,
  );

/**
 * Node library/app skeleton (`platform:node`).
 * Defaults to `type:library`; pass `{ type: "app" }` for Node apps.
 */
export const nodePackage = (
  name: string,
  directory: string,
  overrides?: GeneratorOverrides,
): GeneratePackageOptions =>
  buildOptions(
    name,
    directory,
    "node",
    "library",
    `Node library skeleton for @vision-control/${name}.`,
    overrides,
  );

/**
 * Build-tool integration skeleton (`platform:node`, `type:integration`).
 * Runs in a Node build pipeline (e.g. a Vite plugin).
 */
export const integrationPackage = (
  name: string,
  directory: string,
  overrides?: GeneratorOverrides,
): GeneratePackageOptions =>
  buildOptions(
    name,
    directory,
    "node",
    "integration",
    `Build-tool integration skeleton for @vision-control/${name}.`,
    overrides,
  );

/**
 * Test-fixture app skeleton (`platform:browser`, `type:fixture`).
 * Adversarial host app exercised by the e2e matrix.
 */
export const fixtureApp = (
  name: string,
  directory: string,
  overrides?: GeneratorOverrides,
): GeneratePackageOptions =>
  buildOptions(
    name,
    directory,
    "browser",
    "fixture",
    `Test-fixture app skeleton for @vision-control/${name}.`,
    overrides,
  );

export type GeneratorFactory =
  | typeof visionPackage
  | typeof browserPackage
  | typeof nodePackage
  | typeof integrationPackage
  | typeof fixtureApp;
