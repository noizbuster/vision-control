import { describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME, discoverWorkspaceRoot } from "./services/workspace-service.js";

describe("discoverWorkspaceRoot", () => {
  it("finds the directory containing vision-control.config.ts", () => {
    const exists = (p: string): boolean => p.endsWith(`/project/${CONFIG_FILE_NAME}`);
    const result = discoverWorkspaceRoot(
      "/home/user/project/src/components",
      exists,
      (dir) => dir.split("/").slice(0, -1).join("/") || "/",
    );
    expect(result).toBe("/home/user/project");
  });

  it("walks up until it finds the config file", () => {
    const exists = (p: string): boolean => p === `/root/${CONFIG_FILE_NAME}`;
    const result = discoverWorkspaceRoot(
      "/root/a/b/c",
      exists,
      (dir) => dir.split("/").slice(0, -1).join("/") || "/",
    );
    expect(result).toBe("/root");
  });

  it("returns undefined when no config is found before the root", () => {
    const result = discoverWorkspaceRoot(
      "/a/b/c",
      () => false,
      (dir) => dir.split("/").slice(0, -1).join("/") || "/",
    );
    expect(result).toBeUndefined();
  });
});
