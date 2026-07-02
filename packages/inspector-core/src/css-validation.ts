/**
 * Basic CSS property/value validation for the panel style editor.
 *
 * This is a guard, not a full CSS parser. It validates property names against
 * an MVP-curated allowlist and applies shallow format checks to values. Invalid
 * input is rejected with a human-readable error so the editor can show inline
 * feedback and avoid creating bogus commands.
 */

import { z } from "zod";

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  error: z.string().optional(),
});

export type ValidationResult = z.infer<typeof ValidationResultSchema>;

const ALLOWED_PROPERTIES = new Set([
  // Layout
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "overflow",
  "visibility",
  "opacity",

  // Flex
  "flex-direction",
  "align-items",
  "justify-content",
  "flex-basis",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "align-self",
  "justify-self",
  "gap",
  "row-gap",
  "column-gap",

  // Dimensions
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",

  // Spacing
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",

  // Colors
  "color",
  "background-color",
  "background",

  // Typography
  "font-size",
  "font-weight",
  "line-height",
  "font-family",
  "text-align",
  "text-decoration",
  "letter-spacing",
]);

const LENGTH_RE =
  /^-?(?:\d*\.?\d+)(?:px|em|rem|ex|ch|lh|rlh|vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cm|mm|in|pt|pc|%)$/;
const NUMBER_RE = /^-?\d*\.?\d+$/;
const COLOR_RE =
  /^(?:[a-z]+|#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(|hsla\(|hwb\(|lab\(|lch\(|oklab\(|oklch\(|color\()/;
const BORDER_STYLE_RE = /^(?:none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/;

const DISPLAY_VALUES = new Set([
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "flow-root",
  "none",
  "contents",
  "table",
  "table-row",
  "list-item",
]);

const POSITION_VALUES = new Set(["static", "relative", "absolute", "fixed", "sticky"]);

const FLEX_DIRECTION_VALUES = new Set(["row", "row-reverse", "column", "column-reverse"]);
const ALIGN_ITEMS_VALUES = new Set([
  "stretch",
  "flex-start",
  "flex-end",
  "center",
  "baseline",
  "normal",
]);
const JUSTIFY_CONTENT_VALUES = new Set([
  "flex-start",
  "flex-end",
  "center",
  "space-between",
  "space-around",
  "space-evenly",
  "stretch",
  "normal",
]);
const FLEX_WRAP_VALUES = new Set(["nowrap", "wrap", "wrap-reverse"]);

const TEXT_ALIGN_VALUES = new Set(["left", "right", "center", "justify", "start", "end"]);
const OVERFLOW_VALUES = new Set(["visible", "hidden", "clip", "scroll", "auto"]);
const VISIBILITY_VALUES = new Set(["visible", "hidden", "collapse"]);

function isLengthOrPercentage(value: string): boolean {
  return value === "0" || LENGTH_RE.test(value);
}

function isColor(value: string): boolean {
  return value === "transparent" || value === "currentColor" || COLOR_RE.test(value);
}

function fail(message: string): ValidationResult {
  return { valid: false, error: message };
}

function ok(): ValidationResult {
  return { valid: true };
}

/**
 * Validate that `property` is a known, MVP-relevant CSS property.
 *
 * The allowlist mirrors the computed-style subset from task 15 plus a few
 * common related properties. Full CSS property validation is out of scope.
 */
export function validateCssProperty(property: string): boolean {
  const normalized = property.trim().toLowerCase();
  return normalized.length > 0 && ALLOWED_PROPERTIES.has(normalized);
}

/**
 * Validate a CSS value for a given property.
 *
 * Returns `{ valid: true }` or `{ valid: false, error: string }`. Validation is
 * shallow: lengths, percentages, colors, and a handful of keyword sets. It is
 * intentionally not a full CSS parser.
 */
export function validateCssValue(property: string, value: string): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fail("Value is required");
  }

  const normalizedProperty = property.trim().toLowerCase();
  if (!ALLOWED_PROPERTIES.has(normalizedProperty)) {
    return fail(`Unknown property "${property}"`);
  }

  const lower = trimmed.toLowerCase();

  switch (normalizedProperty) {
    case "display":
      return DISPLAY_VALUES.has(lower) ? ok() : fail(`"${value}" is not a valid display value`);
    case "position":
      return POSITION_VALUES.has(lower) ? ok() : fail(`"${value}" is not a valid position value`);
    case "flex-direction":
      return FLEX_DIRECTION_VALUES.has(lower)
        ? ok()
        : fail(`"${value}" is not a valid flex-direction value`);
    case "align-items":
      return ALIGN_ITEMS_VALUES.has(lower)
        ? ok()
        : fail(`"${value}" is not a valid align-items value`);
    case "justify-content":
      return JUSTIFY_CONTENT_VALUES.has(lower)
        ? ok()
        : fail(`"${value}" is not a valid justify-content value`);
    case "flex-wrap":
      return FLEX_WRAP_VALUES.has(lower) ? ok() : fail(`"${value}" is not a valid flex-wrap value`);
    case "text-align":
      return TEXT_ALIGN_VALUES.has(lower)
        ? ok()
        : fail(`"${value}" is not a valid text-align value`);
    case "overflow":
      return OVERFLOW_VALUES.has(lower) ? ok() : fail(`"${value}" is not a valid overflow value`);
    case "visibility":
      return VISIBILITY_VALUES.has(lower)
        ? ok()
        : fail(`"${value}" is not a valid visibility value`);
  }

  if (
    [
      "width",
      "height",
      "min-width",
      "min-height",
      "max-width",
      "max-height",
      "padding",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "margin",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "border-width",
      "border-radius",
      "top",
      "right",
      "bottom",
      "left",
      "gap",
      "row-gap",
      "column-gap",
      "letter-spacing",
    ].includes(normalizedProperty)
  ) {
    const extra =
      lower === "auto" || lower === "none" || lower === "inherit" || lower === "initial";
    return extra || isLengthOrPercentage(trimmed)
      ? ok()
      : fail(`"${value}" is not a valid length or percentage`);
  }

  if (normalizedProperty === "flex-basis") {
    return lower === "auto" || isLengthOrPercentage(trimmed) || lower === "content"
      ? ok()
      : fail(`"${value}" is not a valid flex-basis value`);
  }

  if (normalizedProperty === "flex-grow" || normalizedProperty === "flex-shrink") {
    return NUMBER_RE.test(trimmed) ? ok() : fail(`"${value}" is not a valid number`);
  }

  if (normalizedProperty === "z-index") {
    return NUMBER_RE.test(trimmed) || lower === "auto"
      ? ok()
      : fail(`"${value}" is not a valid z-index value`);
  }

  if (normalizedProperty === "opacity") {
    return NUMBER_RE.test(trimmed)
      ? ok()
      : fail(`"${value}" is not a valid opacity value (use a number)`);
  }

  if (normalizedProperty === "font-size" || normalizedProperty === "line-height") {
    if (lower === "normal" || isLengthOrPercentage(trimmed)) {
      return ok();
    }
    return NUMBER_RE.test(trimmed) ? ok() : fail(`"${value}" is not a valid font-size/line-height`);
  }

  if (normalizedProperty === "font-weight") {
    const weights = new Set([
      "normal",
      "bold",
      "lighter",
      "bolder",
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
    ]);
    return weights.has(lower) ? ok() : fail(`"${value}" is not a valid font-weight value`);
  }

  if (normalizedProperty === "border-style") {
    return BORDER_STYLE_RE.test(lower)
      ? ok()
      : fail(`"${value}" is not a valid border-style value`);
  }

  if (
    normalizedProperty === "color" ||
    normalizedProperty === "background-color" ||
    normalizedProperty === "border-color"
  ) {
    return isColor(trimmed) ? ok() : fail(`"${value}" is not a valid color`);
  }

  if (normalizedProperty === "border") {
    return validateBorderShorthand(trimmed);
  }

  if (normalizedProperty === "background") {
    return isColor(trimmed) || lower === "none" || lower === "transparent"
      ? ok()
      : fail(`"${value}" is not a recognized background value`);
  }

  if (normalizedProperty === "font-family") {
    return ok();
  }

  if (normalizedProperty === "text-decoration") {
    return ok();
  }

  // Fallback for any other allowed property: accept the value as-is. This keeps
  // the guard from being overly strict while still filtering unknown props.
  return ok();
}

function validateBorderShorthand(value: string): ValidationResult {
  const tokens = value.split(/\s+/);
  if (tokens.length === 0 || tokens.length > 3) {
    return fail(`"${value}" is not a valid border shorthand`);
  }
  let hasWidth = false;
  let hasStyle = false;
  let hasColor = false;
  for (const token of tokens) {
    if (isLengthOrPercentage(token)) {
      if (hasWidth) return fail(`Duplicate width in border shorthand`);
      hasWidth = true;
    } else if (BORDER_STYLE_RE.test(token.toLowerCase())) {
      if (hasStyle) return fail(`Duplicate style in border shorthand`);
      hasStyle = true;
    } else if (isColor(token)) {
      if (hasColor) return fail(`Duplicate color in border shorthand`);
      hasColor = true;
    } else {
      return fail(`"${token}" is not a valid border token`);
    }
  }
  if (
    tokens.length === 1 &&
    hasStyle &&
    value.toLowerCase() !== "none" &&
    value.toLowerCase() !== "hidden"
  ) {
    return fail(`Border shorthand must include a width`);
  }
  return ok();
}
