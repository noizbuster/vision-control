export {
  findJsxElements,
  getElementName,
  type JsxElementLocation,
  parseJsx,
} from "./babel-helpers.js";
export {
  resolveProduction,
  SOURCE_MARKER_ATTRIBUTE,
  type SourceMarkerConfig,
  SourceMarkerConfigSchema,
} from "./config.js";
export { matchAny, normalizePath } from "./match.js";
export {
  type SourceMarkerPluginOptions,
  visionControlSourceMarkerPlugin,
} from "./plugin.js";
export {
  computeElementFingerprint,
  computeWorkspaceRelativePath,
  generateSourceId,
  type SourceIdInput,
} from "./source-id.js";
