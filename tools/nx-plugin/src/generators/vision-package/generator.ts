import { generatePackageFiles } from "../../core/generate-package-files.js";
import { visionPackage } from "../index.js";

/**
 * `nx g`-style entry point for the isomorphic-library generator.
 *
 * Vision Control generators are devkit-independent pure functions (see
 * `src/core/generate-package-files.ts`), so this factory returns the generated
 * file list rather than mutating a Tree. The bulk `tools-nx-plugin:scaffold`
 * target and the per-generator unit tests both consume it. Wiring this into
 * `nx g @vision-control/nx-plugin:vision-package` requires adding `@nx/devkit`
 * as a real dependency (deferred; out of MVP scope).
 */
export const visionPackageGenerator = (name: string, directory: string) =>
  generatePackageFiles(visionPackage(name, directory));

export default visionPackageGenerator;
