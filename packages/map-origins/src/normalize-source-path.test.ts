import { describe, expect, it } from "vitest";

import {
  isBundlerRuntimeNoise,
  joinSourceRoot,
  normalizeMapSourcePath,
} from "./normalize-source-path.js";

describe("normalizeMapSourcePath", () => {
  it("strips webpack:// project-prefix forms", () => {
    expect(normalizeMapSourcePath("webpack://my-app/./src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeMapSourcePath("webpack:///./src/Button.tsx")).toBe("src/Button.tsx");
    expect(normalizeMapSourcePath("webpack://./src/index.ts")).toBe("src/index.ts");
  });

  it("strips webpack-internal:// and ng:// schemes", () => {
    expect(normalizeMapSourcePath("webpack-internal:///./lib/util.ts")).toBe("lib/util.ts");
    expect(normalizeMapSourcePath("ng://MyApp/src/app.component.ts")).toBe(
      "MyApp/src/app.component.ts",
    );
  });

  it("strips query/hash and normalizes backslashes", () => {
    expect(normalizeMapSourcePath("webpack://./src\\App.tsx?v=1#L2")).toBe("src/App.tsx");
  });

  it("returns undefined for empty and bundler runtime noise", () => {
    expect(normalizeMapSourcePath("")).toBeUndefined();
    expect(normalizeMapSourcePath("   ")).toBeUndefined();
    expect(normalizeMapSourcePath("webpack://./webpack/bootstrap")).toBeUndefined();
    expect(normalizeMapSourcePath("(webpack)/buildin/global.js")).toBeUndefined();
    expect(normalizeMapSourcePath("webpack/runtime/make_namespace_object")).toBeUndefined();
  });

  it("keeps plain relative and OS-absolute paths", () => {
    expect(normalizeMapSourcePath("src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeMapSourcePath("/Users/dev/proj/src/App.tsx")).toBe(
      "/Users/dev/proj/src/App.tsx",
    );
  });
});

describe("isBundlerRuntimeNoise", () => {
  it("flags vite client plumbing", () => {
    expect(isBundlerRuntimeNoise("@vite/client")).toBe(true);
    expect(isBundlerRuntimeNoise("node_modules/vite/dist/client/client.mjs")).toBe(true);
    expect(isBundlerRuntimeNoise("src/App.tsx")).toBe(false);
  });
});

describe("joinSourceRoot", () => {
  it("joins relative sources under sourceRoot", () => {
    expect(joinSourceRoot("webpack://app/", "./src/a.ts")).toBe("webpack://app/./src/a.ts");
    expect(joinSourceRoot("src/", "App.tsx")).toBe("src/App.tsx");
  });

  it("leaves absolute URL sources unchanged", () => {
    expect(joinSourceRoot("src/", "https://cdn.test/x.ts")).toBe("https://cdn.test/x.ts");
  });
});
