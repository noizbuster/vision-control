/**
 * @vision-control/tailwind — Tailwind v3 token-aware source adapter (VC-V1V2-11).
 *
 * Public API: the {@link TAILWIND_TOKEN_ADAPTER} and the configurable
 * {@link createTailwindTokenAdapter} factory. The adapter implements the
 * `SourceAdapter` contract from `@vision-control/source-resolver`; re-exported
 * from `packages/source-resolver/src/v1-stubs.ts` so the resolver registers it
 * as a first-class adapter once Wave 3 lands it.
 *
 * Platform: node. `tailwindcss` is a peer dependency (the consumer's project
 * provides the runtime); this package never imports it at runtime — it parses
 * the already-resolved config object. The v4 `@theme` seam is documented but
 * empty in V1 (do not claim v4 support in V1).
 */

export const PACKAGE_NAME = "@vision-control/tailwind";

export {
  createTailwindTokenAdapter,
  TAILWIND_TOKEN_ADAPTER,
  type TailwindTokenAdapterOptions,
} from "./adapter.js";
export {
  type ClassNameAstOrigin,
  type ClassNameCallee,
  findClassNameOrigins,
  findOriginForClass,
} from "./ast-origins.js";
export { type ParsedClassName, parseClassName } from "./class-parser.js";
export type {
  AdapterContext,
  Confidence,
  ConfidenceEvidence,
  OwnershipRisk,
  SourceAdapter,
  SourceCandidate,
} from "./contract.js";
export { buildTailwindCandidate, isTokenBearing } from "./source-candidates.js";
export {
  buildTokenRegistry,
  DEFAULT_TAILWIND_V3_COLORS,
  DEFAULT_TAILWIND_V3_FONT_FAMILY,
  DEFAULT_TAILWIND_V3_FONT_SIZE,
  DEFAULT_TAILWIND_V3_SPACING,
  registerTailwindTokens,
  type TailwindConfigInput,
  TailwindConfigInputSchema,
  type TailwindDesignTokenExport,
  type TailwindToken,
  type TailwindTokenRegistry,
  type TokenCategory,
  type TokenRegistrySink,
} from "./tokens.js";
export { NOOP_V4_THEME_REGISTRY, type TailwindV4ThemeRegistry } from "./v4-seam.js";
