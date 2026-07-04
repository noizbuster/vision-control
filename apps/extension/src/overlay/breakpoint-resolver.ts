/**
 * Active-breakpoint resolver for the content runtime (plan task 7,
 * VC-V1V2-10).
 *
 * Maps the current viewport to a breakpoint label using `matchMedia` against
 * the workspace Tailwind `screens` scale. The content runtime MUST NOT import
 * the node-only `@vision-control/tailwind` package (symmetric boundary rule,
 * plan task 1); the daemon delivers the screens scale as an optional
 * `screens?: readonly string[]` field (plan task 1 page-session schema) and this
 * resolver falls back to a hardcoded default Tailwind v3/v4 scale when none has
 * arrived yet. Unknown delivered names are dropped — the resolver never guesses
 * a pixel width for a breakpoint it cannot resolve ("don't guess beyond the
 * scale").
 *
 * Mobile-first semantics (Tailwind default): the active breakpoint is the
 * LARGEST scale entry whose `min-width` media query currently matches. Below the
 * smallest entry the active breakpoint is `undefined` (base styles apply).
 *
 * `applyToBase` discipline: this resolver only LABELS the active viewport. It
 * never authorises a base-style overwrite — a breakpoint op stays scoped unless
 * its own `applyToBase: true` flag is set (see `isBaseOverwriteAllowed` in
 * `@vision-control/change-ir`). The emitted label carries no base-overwrite
 * signal.
 */

/** Known Tailwind breakpoint min-widths in CSS px (default v3/v4 `theme.screens`). */
const KNOWN_BREAKPOINT_MIN_WIDTH_PX: Readonly<Record<string, number>> = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

/** Default scale used when the daemon has not delivered workspace `screens`. */
const DEFAULT_SCREENS: readonly string[] = ["sm", "md", "lg", "xl", "2xl"];

/** One resolved scale entry: a breakpoint name and its min-width in px. */
export interface BreakpointScaleEntry {
  readonly name: string;
  readonly minWidthPx: number;
}

/**
 * Build an ascending-by-min-width scale from delivered `screens`. Names absent
 * from the known min-width table are DROPPED (never guessed). When `screens` is
 * omitted the hardcoded default Tailwind scale is used.
 */
export function buildBreakpointScale(screens?: readonly string[]): readonly BreakpointScaleEntry[] {
  const names = screens ?? DEFAULT_SCREENS;
  const entries: BreakpointScaleEntry[] = [];
  for (const name of names) {
    const minWidthPx = KNOWN_BREAKPOINT_MIN_WIDTH_PX[name];
    if (minWidthPx !== undefined) entries.push({ name, minWidthPx });
  }
  // Ascending by min-width so the "last matching entry wins" resolution honours
  // mobile-first semantics regardless of the delivered ordering.
  entries.sort((a, b) => a.minWidthPx - b.minWidthPx);
  return entries;
}

/** Default scale (exported for tests + downstream defaults). */
export function defaultBreakpointScale(): readonly BreakpointScaleEntry[] {
  return buildBreakpointScale();
}

export interface BreakpointResolverOptions {
  /** Window used for `matchMedia` (defaults may be overridden for testing). */
  readonly window: Window;
  /** Delivered workspace screens (override the default scale). */
  readonly screens?: readonly string[];
}

export interface BreakpointResolver {
  /** Resolve the current active breakpoint (largest matching min-width). */
  readonly resolve: () => string | undefined;
  /** Replace the screens scale at runtime (daemon delivery). */
  readonly setScreens: (screens: readonly string[]) => void;
  /** The scale currently in use. */
  readonly getScale: () => readonly BreakpointScaleEntry[];
}

/**
 * Create a matchMedia-backed breakpoint resolver. The resolver queries
 * `(min-width: Npx)` for each scale entry in ascending order and returns the
 * last (largest) match, mirroring Tailwind's mobile-first cascade.
 */
export function createBreakpointResolver(options: BreakpointResolverOptions): BreakpointResolver {
  const win = options.window;
  let scale = buildBreakpointScale(options.screens);

  const resolve = (): string | undefined => {
    if (typeof win.matchMedia !== "function") return undefined;
    let active: string | undefined;
    for (const entry of scale) {
      if (win.matchMedia(`(min-width: ${entry.minWidthPx}px)`).matches) {
        active = entry.name;
      }
    }
    return active;
  };

  const setScreens = (screens: readonly string[]): void => {
    scale = buildBreakpointScale(screens);
  };

  const getScale = (): readonly BreakpointScaleEntry[] => scale;

  return { resolve, setScreens, getScale };
}
