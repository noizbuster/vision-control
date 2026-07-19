import { describe, expect, it } from "vitest";

import type { TargetSummary } from "./context-schema.js";
import {
  DEFAULT_REDACTION_SELECTORS,
  type RedactionConfig,
  type RedactionSelectorRule,
  redactTarget,
  resolveSelectorRules,
} from "./redaction-selectors.js";

const makeTarget = (overrides: {
  readonly tagName?: string;
  readonly attributes?: readonly { readonly name: string; readonly value: string }[];
  readonly textContentPreview?: string;
}): TargetSummary => ({
  identity: { selectors: ["#x"] },
  semantic: {
    tagName: overrides.tagName ?? "input",
    textContentPreview: overrides.textContentPreview ?? "",
  },
  breadcrumb: [],
  computedStyle: { display: "block" },
  boxModel: { contentWidth: 0, contentHeight: 0, positionX: 0, positionY: 0 },
  classList: [],
  attributes: (overrides.attributes ?? []).map((a) => ({ name: a.name, value: a.value })),
});

describe("redactTarget — PRD §27.2 selector redaction", () => {
  it("masks an input[type=password] value (not just string-pattern)", () => {
    const result = redactTarget(
      makeTarget({
        attributes: [
          { name: "type", value: "password" },
          { name: "value", value: "hunter2-low-entropy" },
        ],
        textContentPreview: "hunter2-low-entropy",
      }),
      DEFAULT_REDACTION_SELECTORS,
    );
    const valueAttr = result.target.attributes.find((a) => a.name === "value");
    expect(valueAttr?.value).toBe("[REDACTED:password-input]");
    expect(result.target.semantic.textContentPreview).toBe("[REDACTED:password-input]");
    expect(result.redactions.length).toBeGreaterThan(0);
    expect(result.redactions.some((r) => r.patternId === "password-input")).toBe(true);
  });

  it("masks an autocomplete=current-password credential field", () => {
    const result = redactTarget(
      makeTarget({
        attributes: [
          { name: "type", value: "password" },
          { name: "autocomplete", value: "current-password" },
          { name: "value", value: "supersecret" },
        ],
      }),
      DEFAULT_REDACTION_SELECTORS,
    );
    expect(result.target.attributes.find((a) => a.name === "value")?.value).toBe(
      "[REDACTED:password-input]",
    );
    expect(result.redactions.some((r) => r.patternId === "password-input")).toBe(true);
  });

  it("masks an autocomplete=username text input (no type=password)", () => {
    const result = redactTarget(
      makeTarget({
        attributes: [
          { name: "type", value: "text" },
          { name: "autocomplete", value: "username" },
          { name: "value", value: "alice@example.com" },
        ],
      }),
      DEFAULT_REDACTION_SELECTORS,
    );
    expect(result.target.attributes.find((a) => a.name === "value")?.value).toBe(
      "[REDACTED:autocomplete-username]",
    );
  });

  it("masks an input[type=hidden] form field value", () => {
    const result = redactTarget(
      makeTarget({
        attributes: [
          { name: "type", value: "hidden" },
          { name: "name", value: "csrf" },
          { name: "value", value: "csrf-token-value" },
        ],
      }),
      DEFAULT_REDACTION_SELECTORS,
    );
    expect(result.target.attributes.find((a) => a.name === "value")?.value).toBe(
      "[REDACTED:hidden-form-field]",
    );
  });

  it("excludes [data-private] content: drops the attribute and masks text", () => {
    const result = redactTarget(
      makeTarget({
        tagName: "div",
        attributes: [
          { name: "data-private", value: "" },
          { name: "id", value: "ssn" },
        ],
        textContentPreview: "123-45-6789",
      }),
      DEFAULT_REDACTION_SELECTORS,
    );
    expect(result.target.attributes.some((a) => a.name === "data-private")).toBe(false);
    expect(result.target.semantic.textContentPreview).toBe("[REDACTED:data-private]");
    expect(result.redactions.some((r) => r.patternId === "data-private")).toBe(true);
  });

  it("leaves a non-sensitive element untouched", () => {
    const target = makeTarget({
      tagName: "button",
      attributes: [{ name: "type", value: "submit" }],
      textContentPreview: "Submit",
    });
    const result = redactTarget(target, DEFAULT_REDACTION_SELECTORS);
    expect(result.target).toEqual(target);
    expect(result.redactions).toEqual([]);
  });

  it("masks credential-bearing DOM attribute values without masking safe token metadata", () => {
    const result = redactTarget(
      makeTarget({
        tagName: "div",
        attributes: [
          { name: "session-key", value: "aaaaaaaa" },
          { name: "token-budget", value: "4096" },
        ],
      }),
      DEFAULT_REDACTION_SELECTORS,
    );

    expect(result.target.attributes).toEqual([
      { name: "session-key", value: "[REDACTED:sensitive-attribute]" },
      { name: "token-budget", value: "4096" },
    ]);
    expect(result.redactions).toMatchObject([
      { field: "target.attributes.session-key", patternId: "sensitive-attribute" },
    ]);
  });

  it("does not double-count when run twice (idempotent defense-in-depth)", () => {
    const target = makeTarget({
      attributes: [
        { name: "type", value: "password" },
        { name: "value", value: "secret" },
      ],
    });
    const once = redactTarget(target, DEFAULT_REDACTION_SELECTORS);
    const twice = redactTarget(once.target, DEFAULT_REDACTION_SELECTORS);
    expect(twice.target).toEqual(once.target);
    expect(twice.redactions).toEqual([]);
  });

  it("applies user redactionSelectors AFTER the defaults (default-deny)", () => {
    const userRule: RedactionSelectorRule = {
      id: "custom-otp",
      description: "internal OTP field masked by user config.",
      match: { tagName: "input", attributes: { name: "otp" } },
      action: "mask-value",
    };
    const config: RedactionConfig = { redactionSelectors: [userRule] };
    const rules = resolveSelectorRules(config);
    expect(rules[rules.length - 1]).toBe(userRule);
    const result = redactTarget(
      makeTarget({
        attributes: [
          { name: "type", value: "text" },
          { name: "name", value: "otp" },
          { name: "value", value: "123456" },
        ],
      }),
      rules,
    );
    expect(result.target.attributes.find((a) => a.name === "value")?.value).toBe(
      "[REDACTED:custom-otp]",
    );
  });

  it("requires the tagName AND attribute substring to both match", () => {
    const result = redactTarget(
      makeTarget({
        tagName: "div",
        attributes: [
          { name: "type", value: "password" },
          { name: "value", value: "leak" },
        ],
      }),
      DEFAULT_REDACTION_SELECTORS,
    );
    expect(result.target.attributes.find((a) => a.name === "value")?.value).toBe("leak");
    expect(result.redactions).toEqual([]);
  });
});
