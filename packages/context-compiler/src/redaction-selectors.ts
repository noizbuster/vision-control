/**
 * DOM/selector redaction rules (PRD §16.3 + §27.2).
 *
 * The string-pattern redaction in `@vision-control/security` masks secrets by
 * their CONTENT (a value that looks like a token, a `password=` assignment).
 * These rules mask by DOM SHAPE: a value is masked because the element IS a
 * password input, not only because the string looks secret. PRD §27.2 requires
 * both layers — a password value must not slip through because it happens to be
 * a low-entropy string the regex catch-all missed.
 *
 * The matcher operates on the projected {@link TargetSummary} (no live DOM), so
 * a rule is expressed as an element descriptor rather than a CSS selector
 * string. This keeps the engine pure, isomorphic, and testable without a DOM.
 *
 * Types are Zod-derived so `vision-control.config.ts` (validated by the daemon
 * config loader via {@link RedactionConfigSchema}) and the compiler share ONE
 * source of truth — no structural drift under `exactOptionalPropertyTypes`.
 *
 * Default-deny posture (PRD §16.3): the agent context NEVER carries
 * `localStorage`, `sessionStorage`, cookie values, or auth headers — they are
 * absent from {@link CompiledContextSchema} by construction. These selector
 * rules handle the element-level layer the schema cannot encode.
 */

import { isSensitiveKey, REDACTED_MARKER } from "@vision-control/security";
import { z } from "zod";

import type {
  AttributeEntry,
  PrivacyReportRedaction,
  SemanticSummary,
  TargetSummary,
} from "./context-schema.js";

/** How a matched rule transforms the target. */
export const RedactionActionSchema = z.enum(["mask-value", "exclude"]);
export type RedactionAction = z.infer<typeof RedactionActionSchema>;

/**
 * Element shape a rule matches against (selector-equivalent, DOM-free).
 * Every present field must match; absent fields are wildcards.
 */
export const ElementMatchDescriptorSchema = z.object({
  /** Lowercase tag name, e.g. `"input"`. When omitted, matches any tag. */
  tagName: z.string().optional(),
  /**
   * Attribute name → required substring (case-insensitive). Every listed
   * attribute must be present AND contain the substring. Used for value-sensitive
   * matches such as autocomplete credential tokens.
   */
  attributes: z.record(z.string(), z.string()).optional(),
  /** Attribute names that must be present regardless of value. */
  hasAttribute: z.array(z.string()).optional(),
});
export type ElementMatchDescriptor = z.infer<typeof ElementMatchDescriptorSchema>;

/** One named selector redaction rule. */
export const RedactionSelectorRuleSchema = z.object({
  /** Stable id surfaced in the privacy report, e.g. `"password-input"`. */
  id: z.string().min(1),
  /** Human-readable reason surfaced in the privacy report. */
  description: z.string(),
  match: ElementMatchDescriptorSchema,
  action: RedactionActionSchema,
});
export type RedactionSelectorRule = z.infer<typeof RedactionSelectorRuleSchema>;

/**
 * User-supplied redaction config consumed from `vision-control.config.ts`.
 * Extra rules are appended AFTER the PRD §27.2 defaults so the defaults can
 * never be silently disabled by a user rule.
 */
export const RedactionConfigSchema = z.object({
  redactionSelectors: z.array(RedactionSelectorRuleSchema).optional(),
});
export type RedactionConfig = z.infer<typeof RedactionConfigSchema>;

/**
 * Autocomplete attribute tokens that mark a field as credential-bearing
 * (HTML §6.6 "Autofill" credential category). A space-separated `autocomplete`
 * value containing any of these triggers the credential rule.
 */
const CREDENTIAL_AUTOCOMPLETE_TOKENS = [
  "username",
  "current-password",
  "new-password",
  "password",
] as const;

/**
 * The default selector ruleset (PRD §27.2). Ordered: the most specific
 * (password input) first so its id attributes the redaction when multiple
 * rules would match the same element.
 */
export const DEFAULT_REDACTION_SELECTORS: readonly RedactionSelectorRule[] = [
  {
    id: "password-input",
    description: "input[type=password] value masked (PRD §27.2).",
    match: { tagName: "input", attributes: { type: "password" } },
    action: "mask-value",
  },
  ...CREDENTIAL_AUTOCOMPLETE_TOKENS.map(
    (token): RedactionSelectorRule => ({
      id: `autocomplete-${token}`,
      description: `input[autocomplete~=${token}] value masked (PRD §27.2 credential field).`,
      match: { tagName: "input", attributes: { autocomplete: token } },
      action: "mask-value",
    }),
  ),
  {
    id: "hidden-form-field",
    description: "input[type=hidden] value masked (PRD §16.3 hidden form value).",
    match: { tagName: "input", attributes: { type: "hidden" } },
    action: "mask-value",
  },
  {
    id: "data-private",
    description:
      "[data-private] element content excluded: triggering attribute dropped and text masked (PRD §27.2).",
    match: { hasAttribute: ["data-private"] },
    action: "exclude",
  },
];

/**
 * Merge the PRD §27.2 defaults with any user-supplied selectors. User rules run
 * after the defaults; they extend coverage, they never replace it (default-deny).
 */
export const resolveSelectorRules = (config?: RedactionConfig): readonly RedactionSelectorRule[] =>
  config?.redactionSelectors !== undefined && config.redactionSelectors.length > 0
    ? [...DEFAULT_REDACTION_SELECTORS, ...config.redactionSelectors]
    : DEFAULT_REDACTION_SELECTORS;

const findAttribute = (
  attributes: readonly AttributeEntry[],
  name: string,
): AttributeEntry | undefined => attributes.find((entry) => entry.name.toLowerCase() === name);

const descriptorMatches = (
  semantic: SemanticSummary,
  attributes: readonly AttributeEntry[],
  descriptor: ElementMatchDescriptor,
): boolean => {
  if (descriptor.tagName !== undefined && semantic.tagName.toLowerCase() !== descriptor.tagName) {
    return false;
  }
  if (descriptor.hasAttribute !== undefined) {
    for (const name of descriptor.hasAttribute) {
      if (findAttribute(attributes, name) === undefined) return false;
    }
  }
  if (descriptor.attributes !== undefined) {
    for (const [name, substring] of Object.entries(descriptor.attributes)) {
      const entry = findAttribute(attributes, name);
      if (entry === undefined) return false;
      if (!entry.value.toLowerCase().includes(substring.toLowerCase())) return false;
    }
  }
  return true;
};

/** Outcome of {@link redactTarget}: the (possibly masked) target + report entries. */
export interface TargetRedactionResult {
  readonly target: TargetSummary;
  readonly redactions: readonly PrivacyReportRedaction[];
}

const alreadyRedacted = (value: string): boolean => value.startsWith(REDACTED_MARKER);

const SENSITIVE_ATTRIBUTE_PATTERN_ID = "sensitive-attribute";
const SENSITIVE_ATTRIBUTE_DESCRIPTION = "Value of a credential-bearing DOM attribute was masked.";

/**
 * Apply selector redaction to a projected target. Pure, non-mutating, and
 * idempotent: a value already carrying the {@link REDACTED_MARKER} is left
 * untouched and never re-counted, so running this at compile time AND again in
 * the redaction chokepoint does not double-count a redaction.
 *
 * `mask-value` replaces the `value` attribute and the text-content preview with
 * `[REDACTED:<rule-id>]`. `exclude` drops the triggering attribute(s) and masks
 * the text-content preview. Structural identity (tagName, selectors, box model,
 * breadcrumb) is preserved so the agent can still address the element.
 */
export const redactTarget = (
  target: TargetSummary,
  rules: readonly RedactionSelectorRule[],
): TargetRedactionResult => {
  const matched = rules.filter((rule) =>
    descriptorMatches(target.semantic, target.attributes, rule.match),
  );
  const credentialRedactions: PrivacyReportRedaction[] = [];
  let attributes = target.attributes.map((entry) => {
    if (!isSensitiveKey(entry.name) || alreadyRedacted(entry.value)) return entry;
    credentialRedactions.push({
      field: `target.attributes.${entry.name}`,
      patternId: SENSITIVE_ATTRIBUTE_PATTERN_ID,
      description: SENSITIVE_ATTRIBUTE_DESCRIPTION,
      source: "selector",
    });
    return { name: entry.name, value: `[REDACTED:${SENSITIVE_ATTRIBUTE_PATTERN_ID}]` };
  });
  if (matched.length === 0 && credentialRedactions.length === 0) {
    return { target, redactions: [] };
  }

  let textContentPreview = target.semantic.textContentPreview;
  const redactions: PrivacyReportRedaction[] = [...credentialRedactions];

  for (const rule of matched) {
    if (rule.action === "mask-value") {
      const valueEntry = findAttribute(attributes, "value");
      if (valueEntry !== undefined && !alreadyRedacted(valueEntry.value)) {
        const masked = `[REDACTED:${rule.id}]`;
        attributes = attributes.map((entry) =>
          entry.name.toLowerCase() === "value" ? { name: entry.name, value: masked } : entry,
        );
        redactions.push({
          field: "target.attributes.value",
          patternId: rule.id,
          description: rule.description,
          source: "selector",
        });
      }
      if (textContentPreview.length > 0 && !alreadyRedacted(textContentPreview)) {
        textContentPreview = `[REDACTED:${rule.id}]`;
        redactions.push({
          field: "target.semantic.textContentPreview",
          patternId: rule.id,
          description: rule.description,
          source: "selector",
        });
      }
    } else {
      const triggerNames = (
        rule.match.hasAttribute ?? Object.keys(rule.match.attributes ?? {})
      ).map((name) => name.toLowerCase());
      const before = attributes.length;
      attributes = attributes.filter((entry) => !triggerNames.includes(entry.name.toLowerCase()));
      if (attributes.length !== before) {
        redactions.push({
          field: "target.attributes",
          patternId: rule.id,
          description: rule.description,
          source: "selector",
        });
      }
      if (textContentPreview.length > 0 && !alreadyRedacted(textContentPreview)) {
        textContentPreview = `[REDACTED:${rule.id}]`;
        redactions.push({
          field: "target.semantic.textContentPreview",
          patternId: rule.id,
          description: rule.description,
          source: "selector",
        });
      }
    }
  }

  return {
    target: {
      ...target,
      attributes,
      semantic: { ...target.semantic, textContentPreview },
    },
    redactions,
  };
};
