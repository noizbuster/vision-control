import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { RedactionConfigSchema } from "@vision-control/context-compiler";
import { z } from "zod";

/** The config file name the daemon looks for at the workspace root. */
export const CONFIG_FILE_NAME = "vision-control.config.ts";

export const VisionControlConfigSchema = z.object({
  workspace: z.object({
    root: z.string().min(1),
  }),
  daemon: z
    .object({
      port: z.number().int().positive().max(65535).optional(),
      host: z.string().optional(),
    })
    .default({}),
  mcp: z
    .object({
      port: z.number().int().positive().max(65535).optional(),
    })
    .default({}),
  origins: z.array(z.string()).default([]),
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).optional(),
    })
    .default({}),
  /**
   * DOM/selector redaction (PRD §27.2). The schema is owned by
   * `@vision-control/context-compiler` so the config file and the compiler
   * share one source of truth; user `redactionSelectors` extend the PRD
   * defaults at compile time.
   */
  redaction: RedactionConfigSchema.default({}),
});

export type VisionControlConfig = z.infer<typeof VisionControlConfigSchema>;

export type LoadConfigResult =
  | { readonly success: true; readonly config: VisionControlConfig }
  | { readonly success: false; readonly reason: string };

/**
 * Load `vision-control.config.ts` from `workspaceRoot`, validating it against
 * the schema and applying defaults. The `.ts` config is loaded via a dynamic
 * `import()` so Node 22+'s native type stripping handles it without a bundler
 * or transpiler dependency. A sibling `.js` file is used as a fallback.
 */
export async function loadConfig(workspaceRoot: string): Promise<LoadConfigResult> {
  const tsPath = `${workspaceRoot}/${CONFIG_FILE_NAME}`;
  const jsPath = `${workspaceRoot}/vision-control.config.js`;

  let moduleUrl: string | undefined;
  if (existsSync(tsPath)) {
    moduleUrl = pathToFileURL(tsPath).href;
  } else if (existsSync(jsPath)) {
    moduleUrl = pathToFileURL(jsPath).href;
  } else {
    return { success: false, reason: `no ${CONFIG_FILE_NAME} found in ${workspaceRoot}` };
  }

  let mod: { default?: unknown; config?: unknown };
  try {
    mod = (await import(moduleUrl)) as { default?: unknown; config?: unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, reason: `failed to import config: ${message}` };
  }

  const raw = mod.default ?? mod.config;
  if (raw === undefined) {
    return { success: false, reason: "config module exports neither default nor `config`" };
  }

  const result = VisionControlConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, reason: `config validation failed: ${issues}` };
  }
  return { success: true, config: result.data };
}

/** Apply a partial override (e.g. CLI args) on top of a loaded config. */
export function applyOverrides(
  config: VisionControlConfig,
  overrides: { readonly port?: number; readonly host?: string },
): VisionControlConfig {
  return {
    ...config,
    daemon: {
      ...config.daemon,
      ...(overrides.port !== undefined ? { port: overrides.port } : {}),
      ...(overrides.host !== undefined ? { host: overrides.host } : {}),
    },
  };
}
