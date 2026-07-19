import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HmrDemo } from "./HmrDemo.js";

const APP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST_DIRECTORY = resolve(APP_DIRECTORY, "dist");
const SOURCE_MARKER = "data-vc-source";

describe("HmrDemo fixture", () => {
  it("renders its source marker during development", () => {
    // Given
    const element = createElement(HmrDemo);

    // When
    const html = renderToString(element);

    // Then
    expect(html).toContain(SOURCE_MARKER);
  });

  it("excludes source markers from an actual production Vite build", () => {
    // Given
    const buildCommand = ["build"];

    // When
    execFileSync("pnpm", buildCommand, {
      cwd: APP_DIRECTORY,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "pipe",
    });
    const artifactPaths = readdirSync(DIST_DIRECTORY, { encoding: "utf8", recursive: true })
      .map((entry) => resolve(DIST_DIRECTORY, entry))
      .filter((entry) => statSync(entry).isFile());

    // Then
    expect(artifactPaths.some((entry) => readFileSync(entry).includes(SOURCE_MARKER))).toBe(false);
  });
});
