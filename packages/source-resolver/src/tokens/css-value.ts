/**
 * CSS value → pixel numeric conversion (VC-V1V2-18).
 *
 * Local self-contained helper so the token modules never reach across the D15
 * boundary into `@vision-control/tailwind` for a 4-line conversion. Supports
 * `rem` (×16, the browser default root font size) and bare `px`. Returns
 * `undefined` for any other unit so callers can omit the optional `px` field
 * rather than guessing.
 */
const REM_TO_PX = 16;

export const pxValue = (value: string): number | undefined => {
  const rem = /^([0-9.]+)rem$/.exec(value);
  if (rem !== null) {
    const n = Number(rem[1]);
    return Number.isFinite(n) ? n * REM_TO_PX : undefined;
  }
  const px = /^([0-9.]+)px$/.exec(value);
  if (px !== null) {
    const n = Number(px[1]);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
