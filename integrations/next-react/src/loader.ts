/**
 * Webpack loader that applies the dev-only Next.js marker transform
 * (VC-V1V2-13). Referenced by {@link withVisionControlSourceMarkers} in the
 * webpack dev pipeline. Only runs in dev mode (the wrapper short-circuits in
 * production, so this loader is never invoked during `next build`).
 */

import { injectNextMarkers } from "./plugin.js";

export interface MarkerLoaderOptions {
  readonly workspaceRoot: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

interface WebpackLoaderContext {
  readonly resourcePath: string;
  getOptions(): MarkerLoaderOptions;
  async(): (error: Error | null, code?: string, sourceMap?: unknown) => void;
}

export default function markerLoader(this: WebpackLoaderContext, source: string): void {
  const callback = this.async();
  const options = this.getOptions();
  const result = injectNextMarkers({
    code: source,
    filePath: this.resourcePath,
    workspaceRoot: options.workspaceRoot,
    include: options.include,
    exclude: options.exclude,
  });
  if (result === undefined) {
    callback(null, source);
    return;
  }
  // SWC expects a parsed source-map object, not a JSON string.
  const sourceMap = result.map ? (JSON.parse(result.map) as unknown) : undefined;
  callback(null, result.code, sourceMap);
}
