import { describe, expect, it } from "vitest";

import {
  GENERATED_FILE_NAMES,
  type GeneratePackageOptions,
  generatePackageFiles,
  packageNameFor,
} from "../core/generate-package-files.js";
import {
  browserPackage,
  fixtureApp,
  integrationPackage,
  nodePackage,
  visionPackage,
} from "./index.js";

const readGenerated = (
  opts: GeneratePackageOptions,
): { paths: string[]; byPath: Map<string, string> } => {
  const files = generatePackageFiles(opts);
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  return { paths: files.map((f) => f.path), byPath };
};

describe("generatePackageFiles", () => {
  it("emits exactly the canonical skeleton file set", () => {
    const { paths } = readGenerated(visionPackage("protocol", "packages/protocol"));
    const names = paths.map((p) => p.slice("packages/protocol/".length));
    expect(names).toEqual([...GENERATED_FILE_NAMES]);
  });

  it("writes the correct package name + private ESM module with catalog devDeps", () => {
    const { byPath } = readGenerated(visionPackage("geometry", "packages/geometry"));
    const pkg = JSON.parse(byPath.get("packages/geometry/package.json") ?? "{}");
    expect(pkg.name).toBe("@vision-control/geometry");
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe("module");
    expect(pkg.devDependencies.typescript).toBe("catalog:");
    expect(pkg.devDependencies.vitest).toBe("catalog:");
  });

  it("stamps project.json tags from the generator kind and emits a build target using tsconfig.build.json", () => {
    const { byPath } = readGenerated(nodePackage("daemon", "apps/daemon", { type: "app" }));
    const project = JSON.parse(byPath.get("apps/daemon/project.json") ?? "{}");
    expect(project.tags).toEqual(["platform:node", "type:app", "scope:daemon"]);
    expect(project.projectType).toBe("application");
    expect(project.targets.build.options.command).toBe("tsc -p tsconfig.build.json");
    expect(project.targets.typecheck.options.cwd).toBe("apps/daemon");
  });

  it("uses platform:browser for browser library/app/fixture kinds", () => {
    const lib = JSON.parse(
      readGenerated(browserPackage("overlay-ui", "packages/overlay-ui")).byPath.get(
        "packages/overlay-ui/project.json",
      ) ?? "{}",
    );
    expect(lib.tags).toEqual(["platform:browser", "type:library", "scope:overlay-ui"]);

    const app = JSON.parse(
      readGenerated(browserPackage("extension", "apps/extension", { type: "app" })).byPath.get(
        "apps/extension/project.json",
      ) ?? "{}",
    );
    expect(app.tags).toEqual(["platform:browser", "type:app", "scope:extension"]);

    const fixture = JSON.parse(
      readGenerated(fixtureApp("playground-react-vite", "apps/playground-react-vite")).byPath.get(
        "apps/playground-react-vite/project.json",
      ) ?? "{}",
    );
    expect(fixture.tags).toEqual([
      "platform:browser",
      "type:fixture",
      "scope:playground-react-vite",
    ]);
  });

  it("uses platform:node + type:integration for build-tool integrations", () => {
    const project = JSON.parse(
      readGenerated(integrationPackage("vite-react", "integrations/vite-react")).byPath.get(
        "integrations/vite-react/project.json",
      ) ?? "{}",
    );
    expect(project.tags).toEqual(["platform:node", "type:integration", "scope:vite-react"]);
  });

  it("the build tsconfig excludes test files (closes the test-files-in-dist gap)", () => {
    const { byPath } = readGenerated(visionPackage("protocol", "packages/protocol"));
    const build = JSON.parse(byPath.get("packages/protocol/tsconfig.build.json") ?? "{}");
    expect(build.extends).toBe("./tsconfig.json");
    expect(build.exclude).toContain("src/**/*.test.ts");
  });

  it("emits an index + test that agree on the sentinel value", () => {
    const { byPath } = readGenerated(visionPackage("logger", "packages/logger"));
    const index = byPath.get("packages/logger/src/index.ts") ?? "";
    const test = byPath.get("packages/logger/src/index.test.ts") ?? "";
    expect(index).toContain('export const PACKAGE_NAME = "@vision-control/logger";');
    expect(test).toContain('toBe("@vision-control/logger")');
  });

  it("packageNameFor maps a directory name to the org-scoped name", () => {
    expect(packageNameFor("protocol")).toBe("@vision-control/protocol");
    expect(packageNameFor("playground-react-vite")).toBe("@vision-control/playground-react-vite");
  });
});
