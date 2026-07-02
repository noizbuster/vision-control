import { generatePackageFiles } from "../../core/generate-package-files.js";
import { fixtureApp } from "../index.js";

export const fixtureAppGenerator = (name: string, directory: string) =>
  generatePackageFiles(fixtureApp(name, directory));

export default fixtureAppGenerator;
