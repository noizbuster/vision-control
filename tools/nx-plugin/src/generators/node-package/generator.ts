import { generatePackageFiles } from "../../core/generate-package-files.js";
import { nodePackage } from "../index.js";

export const nodePackageGenerator = (
  name: string,
  directory: string,
  type: "library" | "app" = "library",
) => generatePackageFiles(nodePackage(name, directory, { type }));

export default nodePackageGenerator;
