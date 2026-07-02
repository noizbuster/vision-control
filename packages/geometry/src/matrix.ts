import { z } from "zod";

import type { Point } from "./point.js";

/**
 * 2D affine transform matrix as the standard CSS/DOMMatrix 6-number tuple
 * `[a, b, c, d, e, f]`, representing the homogeneous matrix
 * ```
 * | a c e |
 * | b d f |
 * | 0 0 1 |
 * ```
 * This matches `DOMMatrix` 2D semantics (`a`=m11, `b`=m12, `c`=m21, `d`=m22,
 * `e`=m41, `f`=m42), so a browser adapter converts between `DOMMatrix` and
 * `Matrix2D` trivially. JSON-safe (a plain 6-number array).
 */
export const Matrix2DSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
export type Matrix2D = readonly [number, number, number, number, number, number];

/** Result of {@link decompose}. */
export interface DecomposedMatrix {
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Rotation in radians. */
  readonly rotation: number;
}

/** Identity matrix. */
export const identity = (): Matrix2D => [1, 0, 0, 1, 0, 0];

/**
 * Multiply `m1 * m2` (point-wise: `m2` is applied first, matching CSS transform
 * composition order where `transform: A B` produces the matrix `A * B`).
 */
export const multiply = (m1: Matrix2D, m2: Matrix2D): Matrix2D => {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
};

/** Post-multiply by a translation: `m * T(tx, ty)`. */
export const translate = (m: Matrix2D, tx: number, ty: number): Matrix2D =>
  multiply(m, [1, 0, 0, 1, tx, ty]);

/** Post-multiply by a scale: `m * S(sx, sy)`. */
export const scale = (m: Matrix2D, sx: number, sy: number): Matrix2D =>
  multiply(m, [sx, 0, 0, sy, 0, 0]);

/** Post-multiply by a rotation (angle in radians): `m * R(angleRad)`. */
export const rotate = (m: Matrix2D, angleRad: number): Matrix2D => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return multiply(m, [cos, sin, -sin, cos, 0, 0]);
};

/** Apply the matrix to a point (affine transform). */
export const applyToPoint = (m: Matrix2D, point: Point): Point => {
  const [a, b, c, d, e, f] = m;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
};

/** Determinant of the 2x2 linear part (`a*d - b*c`). */
const determinant = (m: Matrix2D): number => {
  const [a, b, c, d] = m;
  return a * d - b * c;
};

/**
 * Invert `m`. Returns `undefined` when the matrix is non-invertible
 * (determinant ~ 0 within `tolerance`, default 1e-12).
 */
export const invert = (m: Matrix2D, tolerance: number = 1e-12): Matrix2D | undefined => {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) <= tolerance) return undefined;
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    (c * f - d * e) * invDet,
    (b * e - a * f) * invDet,
  ];
};

/**
 * Decompose `m` into translation, scale, and rotation. This is the inverse of
 * composing `translate(rotate(scale(identity, sx, sy), r), tx, ty)`.
 *
 * 2D decomposition is ambiguous under reflection: a flip encoded in `scaleX`
 * is re-expressed as a rotation by π plus a negative `scaleY`. For matrices
 * built from positive scales (the common case), the round-trip is exact.
 */
export const decompose = (m: Matrix2D): DecomposedMatrix => {
  const [a, b, c, d, e, f] = m;
  const scaleX = Math.hypot(a, b);
  if (scaleX === 0) {
    // Degenerate: no rotation, scaleY from the second column.
    return { translateX: e, translateY: f, scaleX: 0, scaleY: Math.hypot(c, d), rotation: 0 };
  }
  const rotation = Math.atan2(b, a);
  const scaleY = determinant(m) / scaleX;
  return { translateX: e, translateY: f, scaleX, scaleY, rotation };
};

/** Typed error raised when a CSS transform string cannot be parsed. */
export class MalformedTransformError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedTransformError";
  }
}

/**
 * Typed error raised for transforms this parser intentionally does not support
 * (`skew`, `perspective`, unknown functions). `matrix3d` IS supported via
 * down-projection; only its non-affine 3D components are rejected here.
 */
export class UnsupportedTransformError extends Error {
  readonly functionName: string;
  constructor(functionName: string) {
    super(`Unsupported CSS transform function: ${functionName}`);
    this.name = "UnsupportedTransformError";
    this.functionName = functionName;
  }
}

const TOKEN_RE = /(\w+)\s*\(([^)]*)\)/g;

/** Parse a length argument: strip optional `px` unit, tolerate bare numbers. */
const parseLength = (raw: string): number => {
  const trimmed = raw.trim();
  if (trimmed.endsWith("px")) return Number.parseFloat(trimmed.slice(0, -2));
  return Number.parseFloat(trimmed);
};

/**
 * Parse an angle argument: `deg` -> radians, `rad` -> as-is, bare number is
 * treated as degrees (lenient, matching common CSS usage for `rotate()`).
 */
const parseAngle = (raw: string): number => {
  const trimmed = raw.trim();
  if (trimmed.endsWith("deg")) return (Number.parseFloat(trimmed.slice(0, -3)) * Math.PI) / 180;
  if (trimmed.endsWith("rad")) return Number.parseFloat(trimmed.slice(0, -3));
  if (trimmed.endsWith("grad")) return (Number.parseFloat(trimmed.slice(0, -4)) * Math.PI) / 200;
  if (trimmed.endsWith("turn")) return Number.parseFloat(trimmed.slice(0, -4)) * 2 * Math.PI;
  return (Number.parseFloat(trimmed) * Math.PI) / 180;
};

const parseScalar = (raw: string): number => Number.parseFloat(raw.trim());

const splitArgs = (args: string): string[] =>
  args
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

/** Build the matrix for a single transform function call. */
const functionMatrix = (name: string, rawArgs: string): Matrix2D => {
  const args = splitArgs(rawArgs);
  switch (name) {
    case "translate": {
      const tx = args[0] !== undefined ? parseLength(args[0]) : 0;
      const ty = args[1] !== undefined ? parseLength(args[1]) : 0;
      return [1, 0, 0, 1, tx, ty];
    }
    case "translateX": {
      const tx = args[0] !== undefined ? parseLength(args[0]) : 0;
      return [1, 0, 0, 1, tx, 0];
    }
    case "translateY": {
      const ty = args[0] !== undefined ? parseLength(args[0]) : 0;
      return [1, 0, 0, 1, 0, ty];
    }
    case "scale": {
      const sx = args[0] !== undefined ? parseScalar(args[0]) : 1;
      const sy = args[1] !== undefined ? parseScalar(args[1]) : sx;
      return [sx, 0, 0, sy, 0, 0];
    }
    case "scaleX": {
      const sx = args[0] !== undefined ? parseScalar(args[0]) : 1;
      return [sx, 0, 0, 1, 0, 0];
    }
    case "scaleY": {
      const sy = args[0] !== undefined ? parseScalar(args[0]) : 1;
      return [1, 0, 0, sy, 0, 0];
    }
    case "rotate": {
      const angle = args[0] !== undefined ? parseAngle(args[0]) : 0;
      return [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
    }
    case "matrix": {
      if (args.length !== 6) {
        throw new MalformedTransformError(`matrix() requires 6 arguments, got ${args.length}`);
      }
      const [a, b, c, d, e, f] = args.map(parseScalar) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      return [a, b, c, d, e, f];
    }
    case "matrix3d": {
      // 16 column-major values; down-project the affine 2D part.
      if (args.length !== 16) {
        throw new MalformedTransformError(`matrix3d() requires 16 arguments, got ${args.length}`);
      }
      const v = args.map(parseScalar);
      const m43 = v[14] ?? 0; // translation-z proxy; reject 3D translation.
      if (Math.abs(m43) > 1e-12)
        throw new UnsupportedTransformError("matrix3d with 3D translation");
      return [v[0] ?? 1, v[1] ?? 0, v[4] ?? 0, v[5] ?? 1, v[12] ?? 0, v[13] ?? 0];
    }
    default:
      throw new UnsupportedTransformError(name);
  }
};

/**
 * Parse a CSS `transform` string into a single {@link Matrix2D}. Functions are
 * composed left-to-right (matching CSS: `transform: A B` yields the matrix
 * `A * B`). Whitespace and unit flexibility (`10px`, `10`) are tolerated.
 *
 * Supported: `translate[/translateX/translateY]`, `scale[/scaleX/scaleY]`,
 * `rotate`, `matrix()`, and `matrix3d()` (down-projected to 2D). `skew` and
 * `perspective` raise {@link UnsupportedTransformError}; unknown functions
 * raise {@link UnsupportedTransformError}; structural problems raise
 * {@link MalformedTransformError}. An empty/whitespace string yields identity.
 */
export const fromString = (transformStr: string): Matrix2D => {
  const trimmed = transformStr.trim();
  if (trimmed.length === 0) return identity();
  let result: Matrix2D = identity();
  let lastIndex = 0;
  for (const match of trimmed.matchAll(TOKEN_RE)) {
    const name = match[1];
    const rawArgs = match[2] ?? "";
    if (name === undefined) continue;
    if (match.index === undefined) continue;
    lastIndex = match.index + match[0].length;
    result = multiply(result, functionMatrix(name, rawArgs));
  }
  // Any non-whitespace leftover means the string was malformed.
  if (trimmed.slice(lastIndex).trim().length > 0) {
    throw new MalformedTransformError(
      `Unexpected trailing input in transform: ${JSON.stringify(trimmed)}`,
    );
  }
  return result;
};
