/**
 * Source provenance per design token (VC-V1V2-18 / PRD 15.x).
 *
 * Every token registered in the {@link TokenRegistry} carries provenance: WHERE
 * it came from. This is the load-bearing difference between "the runtime value
 * is 0.5rem" and "0.5rem because tailwind.config.js theme.spacing['2'] says so".
 * Without provenance a conflict between a Tailwind token and a CSS custom
 * property is invisible; with it the registry can attribute each value to its
 * source and surface actionable warnings.
 *
 * The provenance kinds are framework-agnostic (NOT Tailwind-only):
 * - `tailwind-v3-config` — `tailwind.config.{js,ts}` `theme` object.
 * - `tailwind-v4-theme` — Tailwind v4 `@theme { --*: ...; }` CSS block.
 * - `css-custom-property` — plain `:root { --foo: ...; }` / component CSS.
 * - `css-modules-value` — CSS Modules `@value` exports.
 * - `adapter-hint` — a framework adapter (Vue/Svelte/CSS-in-JS/...) supplies
 *   the token via its adapter contract, with no config-file origin.
 */
import { z } from "zod";

export const TOKEN_SOURCE_KINDS = [
  "tailwind-v3-config",
  "tailwind-v4-theme",
  "css-custom-property",
  "css-modules-value",
  "adapter-hint",
] as const;

export type TokenSourceKind = (typeof TOKEN_SOURCE_KINDS)[number];

export const TokenSourceKindSchema = z.enum(TOKEN_SOURCE_KINDS);

/**
 * Provenance record attached to every registered token.
 *
 * `sourcePath` is workspace-relative (never absolute — same invariant as
 * {@link SourceCandidate}). `adapterId` is set only for the `adapter-hint` kind.
 * `sourceLine` is the 1-based line in `sourcePath` when known.
 */
export const TokenProvenanceSchema = z.object({
  kind: TokenSourceKindSchema,
  sourcePath: z.string().min(1).optional(),
  adapterId: z.string().min(1).optional(),
  sourceLine: z.number().int().positive().optional(),
});

export type TokenProvenance = z.infer<typeof TokenProvenanceSchema>;

/**
 * Validate and normalise a provenance record. Unknown kinds are rejected at the
 * Zod boundary (the closed enum IS the malformed-input defense).
 */
export const createTokenProvenance = (input: TokenProvenance): TokenProvenance =>
  TokenProvenanceSchema.parse(input);
