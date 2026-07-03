/**
 * Turbopack detection and diagnostic (VC-V1V2-13).
 *
 * V1 supports webpack/Babel ONLY. Turbopack is Next.js's experimental Rust-based
 * bundler. It does NOT support the Babel-transform-based marker injection path.
 * Rather than silently fail or produce partial markers, this module detects
 * Turbopack usage and returns an explicit, honest diagnostic.
 *
 * Detection signals (any one triggers the diagnostic):
 * - `process.env.TURBOPACK` is set to a truthy value.
 * - `process.env.NEXT_PRIVATE_TURBOPACK` is set.
 * - The Next.js CLI was invoked with `--turbopack` (reflected in
 *   `process.env.npm_lifecycle_flags` or argv in some setups).
 * - The `next.config.js` `experimental.turbopack` field is set (passed via the
 *   `nextConfig` input).
 * - The `next dev --turbo` alias sets `process.env.TURBO`.
 *
 * The diagnostic is advisory: it does NOT throw or block the build. The caller
 * decides whether to surface it to the user. This is the "do not overclaim"
 * guardrail — V1 is honest about Turbopack's unsupported status.
 */

export interface TurbopackDetectionInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly nextConfig?: {
    readonly experimental?: {
      readonly turbopack?: unknown;
    };
  };
  readonly argv?: readonly string[];
}

export interface TurbopackDiagnostic {
  readonly detected: boolean;
  readonly reason: string;
  readonly diagnostic: string;
}

const TURBOPACK_DIAGNOSTIC_MESSAGE =
  "Turbopack is not yet supported by the Vision Control Next.js source marker plugin in V1. " +
  "Source markers require the webpack/Babel dev path. Use `next dev` (without --turbopack) " +
  "for marker injection. Turbopack support is a V2+ experimental track (ADR-008 / VC-V1V2-13).";

const isTruthy = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const lower = value.toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes";
};

/**
 * Detect whether Turbopack is active. Checks environment variables, the Next.js
 * config's `experimental.turbopack` field, and CLI argv for `--turbopack`/`--turbo`.
 */
export const detectTurbopack = (input: TurbopackDetectionInput = {}): TurbopackDiagnostic => {
  const env = input.env ?? process.env;

  const envSignal = env.TURBOPACK ?? env.NEXT_PRIVATE_TURBOPACK ?? env.TURBO;
  if (isTruthy(envSignal)) {
    return {
      detected: true,
      reason: `environment variable signals Turbopack (TURBOPACK/NEXT_PRIVATE_TURBOPACK/TURBO="${envSignal}")`,
      diagnostic: TURBOPACK_DIAGNOSTIC_MESSAGE,
    };
  }

  const experimentalTurbopack = input.nextConfig?.experimental?.turbopack;
  if (experimentalTurbopack !== undefined && experimentalTurbopack !== null) {
    return {
      detected: true,
      reason: "next.config.js experimental.turbopack is configured",
      diagnostic: TURBOPACK_DIAGNOSTIC_MESSAGE,
    };
  }

  const argv = input.argv ?? process.argv;
  for (const arg of argv) {
    if (arg === "--turbopack" || arg === "--turbo") {
      return {
        detected: true,
        reason: `CLI flag "${arg}" requests Turbopack`,
        diagnostic: TURBOPACK_DIAGNOSTIC_MESSAGE,
      };
    }
  }

  return {
    detected: false,
    reason: "no Turbopack signal detected; webpack/Babel dev path is active",
    diagnostic: "",
  };
};

/**
 * Convenience: returns the diagnostic message if Turbopack is detected, or
 * `undefined` if webpack/Babel is active. Callers use this to decide whether
 * to warn the user.
 */
export const turbopackWarning = (input: TurbopackDetectionInput = {}): string | undefined => {
  const result = detectTurbopack(input);
  return result.detected ? result.diagnostic : undefined;
};
