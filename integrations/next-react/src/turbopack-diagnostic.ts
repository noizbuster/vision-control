/**
 * Turbopack detection and diagnostic (VC-V1V2-13 / ADR-008).
 *
 * V1 supports BOTH the webpack/Babel dev path AND the Turbopack dev path. The
 * Turbopack path registers the same Babel-based `injectNextMarkers` transform
 * under `turbopack.rules` via webpack's `loader-runner` (which Turbopack uses
 * to execute webpack-style loaders in a Node worker). This was verified on
 * Next.js 15.5.4: `next dev --turbo` injects markers; `next build --turbo`
 * (gated by `isNextProduction`) ships none.
 *
 * Detection signals (any one triggers Turbopack-active state):
 * - `process.env.TURBOPACK` is set to a truthy value.
 * - `process.env.NEXT_PRIVATE_TURBOPACK` is set.
 * - The Next.js CLI was invoked with `--turbopack`/`--turbo`.
 * - The `next.config.js` top-level `turbopack` field is set.
 * - The `next.config.js` `experimental.turbopack` field is set (legacy).
 *
 * Result states:
 * - `detected=false` — webpack/Babel dev path active; no Turbopack signal.
 * - `detected=true, supported=true` — Turbopack active AND the config carries
 *   `turbopack.rules` entries for `*.tsx`/`*.jsx` (markers active via Turbopack).
 * - `detected=true, supported=false` — Turbopack active but no marker rule is
 *   wired (the user runs Turbopack without `withVisionControlSourceMarkers`).
 *   Advisory diagnostic only; markers will NOT inject under Turbopack.
 */

export interface TurbopackDetectionInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly nextConfig?: {
    readonly turbopack?: {
      readonly rules?: Record<string, unknown>;
    } | null;
    readonly experimental?: {
      readonly turbopack?: unknown;
    };
  };
  readonly argv?: readonly string[];
}

export interface TurbopackDiagnostic {
  readonly detected: boolean;
  readonly supported: boolean;
  readonly reason: string;
  readonly diagnostic: string;
}

const TURBOPACK_SUCCESS_MESSAGE =
  "Turbopack is active and Vision Control source markers are wired via " +
  "`turbopack.rules`. Markers inject in dev (`next dev --turbo`) and are " +
  "gated out of production (`next build --turbo`) by isNextProduction " +
  "(ADR-008 / VC-V1V2-13).";

const TURBOPACK_UNCONFIGURED_MESSAGE =
  "Turbopack is active but the Vision Control marker rule is not wired under " +
  "`turbopack.rules`. Source markers will NOT inject. Either use " +
  "`withVisionControlSourceMarkers()` (which registers both webpack and " +
  "Turbopack rules) or run `next dev` without --turbo for the webpack path " +
  "(ADR-008 / VC-V1V2-13).";

const isTruthy = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const lower = value.toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes";
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Returns true when the `nextConfig.turbopack.rules` map carries a marker rule
 * for `*.tsx` or `*.jsx` (the keys `withVisionControlSourceMarkers` registers).
 */
const hasMarkerTurbopackRule = (nextConfig: TurbopackDetectionInput["nextConfig"]): boolean => {
  const rules = nextConfig?.turbopack?.rules;
  if (!isObject(rules)) return false;
  const tsxRule = rules["*.tsx"];
  const jsxRule = rules["*.jsx"];
  return isObject(tsxRule) || isObject(jsxRule);
};

/**
 * Detect whether Turbopack is active and whether the marker rule is wired.
 * Checks environment variables, the Next.js config `turbopack` /
 * `experimental.turbopack` fields, and CLI argv for `--turbopack`/`--turbo`.
 */
export const detectTurbopack = (input: TurbopackDetectionInput = {}): TurbopackDiagnostic => {
  const env = input.env ?? process.env;
  const nextConfig = input.nextConfig;

  let detected = false;
  let reason = "";

  const envSignal = env.TURBOPACK ?? env.NEXT_PRIVATE_TURBOPACK ?? env.TURBO;
  if (isTruthy(envSignal)) {
    detected = true;
    reason = `environment variable signals Turbopack (TURBOPACK/NEXT_PRIVATE_TURBOPACK/TURBO="${envSignal}")`;
  }

  if (!detected) {
    const topLevelTurbopack = nextConfig?.turbopack;
    if (topLevelTurbopack !== undefined && topLevelTurbopack !== null) {
      detected = true;
      reason = "next.config.js turbopack field is configured";
    }
  }

  if (!detected) {
    const experimentalTurbopack = nextConfig?.experimental?.turbopack;
    if (experimentalTurbopack !== undefined && experimentalTurbopack !== null) {
      detected = true;
      reason = "next.config.js experimental.turbopack is configured";
    }
  }

  if (!detected) {
    const argv = input.argv ?? process.argv;
    for (const arg of argv) {
      if (arg === "--turbopack" || arg === "--turbo") {
        detected = true;
        reason = `CLI flag "${arg}" requests Turbopack`;
        break;
      }
    }
  }

  if (!detected) {
    return {
      detected: false,
      supported: false,
      reason: "no Turbopack signal detected; webpack/Babel dev path is active",
      diagnostic: "",
    };
  }

  const markerWired = hasMarkerTurbopackRule(nextConfig);
  return {
    detected: true,
    supported: markerWired,
    reason,
    diagnostic: markerWired ? TURBOPACK_SUCCESS_MESSAGE : TURBOPACK_UNCONFIGURED_MESSAGE,
  };
};

/**
 * Convenience: returns the diagnostic message if Turbopack is detected but the
 * marker rule is NOT wired (the advisory case). Returns `undefined` when
 * webpack/Babel is active OR when Turbopack is active and markers are wired.
 */
export const turbopackWarning = (input: TurbopackDetectionInput = {}): string | undefined => {
  const result = detectTurbopack(input);
  return result.detected && !result.supported ? result.diagnostic : undefined;
};
