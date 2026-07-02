import { generatePackageFiles } from "../../core/generate-package-files.js";
import { integrationPackage } from "../index.js";

export const integrationPackageGenerator = (name: string, directory: string) =>
  generatePackageFiles(integrationPackage(name, directory));

export default integrationPackageGenerator;
