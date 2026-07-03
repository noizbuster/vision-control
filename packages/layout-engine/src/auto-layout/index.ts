/**
 * Auto Layout panel module (VC-V1V2-08 / PRD section 639-693, 2287-2311).
 *
 * Public API surface for the Auto Layout panel: command vocabulary,
 * context-sensitive Hug/Fill/Fixed resolution, semantic candidate resolution,
 * and Tailwind/CSS-variable token suggestion providers.
 */

// Semantic candidate resolution
export {
  type AutoLayoutCandidateResult,
  type AutoLayoutContainerContext,
  type ChildSizingCandidate,
  type ContainerPropertyCandidate,
  isAutoLayoutSupported,
  resolveAutoLayoutCandidate,
  type UnsupportedContainerDiagnostic,
} from "./auto-layout-candidates.js";
// Command vocabulary
export {
  AUTO_LAYOUT_ALIGN_CROSS,
  AUTO_LAYOUT_ALIGN_MAIN,
  AUTO_LAYOUT_COMMAND_KINDS,
  AUTO_LAYOUT_DIRECTIONS,
  AUTO_LAYOUT_WRAP,
  type AutoLayoutAlignCross,
  type AutoLayoutAlignMain,
  type AutoLayoutCommand,
  type AutoLayoutCommandKind,
  type AutoLayoutDirection,
  type AutoLayoutWrap,
  BOX_SIDES,
  type BoxSide,
  CHILD_SIZING_INTENTS,
  type ChildSizingIntent,
  isContainerLevelCommand,
  PADDING_MODES,
  type PaddingMode,
  type SetAlignCrossCommand,
  type SetAlignMainCommand,
  type SetChildSizingCommand,
  type SetDirectionCommand,
  type SetGapCommand,
  type SetPaddingCommand,
  type SetWrapCommand,
} from "./auto-layout-commands.js";
// Context-sensitive Hug/Fill/Fixed resolution
export {
  type CssDeclaration,
  type ExtendedSizingParentContext,
  resolveHugFillFixed,
  type SafeSizingResolutionInput,
  SIZING_PARENT_CONTEXTS,
  type SizingParentContext,
  type SizingResolution,
  type SizingResolutionInput,
  type SizingResolutionResult,
  tryResolveHugFillFixed,
} from "./hug-fill-fixed.js";

// Token suggestion providers
export {
  type CandidateTokenSuggestion,
  composeProviders,
  createSpacingTokenProvider,
  isSpacingProperty,
  mapCssToTailwindUtility,
  type SpacingScale,
  suggestForCandidate,
  suggestTokens,
  type TokenSuggestion,
  type TokenSuggestionProvider,
} from "./tailwind-suggestions.js";
