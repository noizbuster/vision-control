import { z } from "zod";

/**
 * Source-marker plugin configuration (PRD 14.3 / 26).
 *
 * - `include` / `exclude` — glob patterns (POSIX, `**` aware) selecting which
 *   workspace JSX/TSX files receive markers. Defaults mark every workspace
 *   `.jsx`/`.tsx` and exclude `node_modules`.
 * - `production` — an explicit kill switch. When `true` the plugin emits NO
 *   markers even in dev. This is belt-and-suspenders on top of the `command`
 *   signal (see {@link resolveProduction}).
 * - `workspaceRoot` — the prefix stripped to form the workspace-relative path
 *   baked into each opaque source id. Defaults to the Vite project root.
 */

export const SourceMarkerConfigSchema = z.object({
  include: z.array(z.string().min(1)).default(["**/*.{jsx,tsx}"]),
  exclude: z.array(z.string().min(1)).default(["node_modules/**"]),
  production: z.boolean().default(false),
  workspaceRoot: z.string().min(1).optional(),
});

export type SourceMarkerConfig = z.infer<typeof SourceMarkerConfigSchema>;

export const SOURCE_MARKER_ATTRIBUTE = "data-vc-source";

/**
 * Vite reports the active mode via the `config`/`configResolved` hooks as
 * `command: "build" | "serve"`. A production BUILD is the authoritative
 * "do not inject" signal: `import.meta.env.PROD` is NOT reliable here because
 * Vite only substitutes it in the APP's modules it transforms — the plugin
 * itself runs in Node where `import.meta.env` is undefined. We fail safe: a
 * build OR an explicit `production` flag disables injection entirely (PRD
 * guardrail, ADR-008).
 */
export const resolveProduction = (
  config: Pick<SourceMarkerConfig, "production">,
  command: "build" | "serve",
): boolean => config.production === true || command === "build";
