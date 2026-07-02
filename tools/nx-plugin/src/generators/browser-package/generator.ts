import { generatePackageFiles } from "../../core/generate-package-files.js";
import { browserPackage } from "../index.js";

export const browserPackageGenerator = (
  name: string,
  directory: string,
  type: "library" | "app" = "library",
) => generatePackageFiles(browserPackage(name, directory, { type }));

export default browserPackageGenerator;
