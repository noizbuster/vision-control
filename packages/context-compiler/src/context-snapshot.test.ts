import { describe, expect, it } from "vitest";
import { makeInputs, makeSelection } from "./context-test-fixtures.js";
import {
  CompiledContextSchema,
  compileContext,
  redactContext,
  renderJson,
  renderMarkdown,
} from "./index.js";

describe("compiled context compatibility", () => {
  it("parses old 1.0.0 and 1.1.0 metadata versions", () => {
    const current = compileContext(makeInputs());
    for (const formatVersion of ["1.0.0", "1.1.0"] as const) {
      const legacy = { ...current, metadata: { ...current.metadata, formatVersion } };
      expect(CompiledContextSchema.safeParse(legacy).success).toBe(true);
    }
    expect(current.metadata.formatVersion).toBe("1.2.0");
  });
});

describe("DOM selector redaction", () => {
  it("masks a password input end-to-end", () => {
    const context = redactContext(
      compileContext(
        makeInputs({
          selection: makeSelection({
            tagName: "input",
            attributes: [
              { name: "type", value: "password" },
              { name: "value", value: "VC_PW_SHOULD_NOT_EXPORT" },
            ],
            textContentPreview: "VC_PW_SHOULD_NOT_EXPORT",
          }),
        }),
      ),
    );
    expect(renderJson(context)).not.toContain("VC_PW_SHOULD_NOT_EXPORT");
    expect(renderMarkdown(context)).not.toContain("VC_PW_SHOULD_NOT_EXPORT");
    expect(renderJson(context)).toContain("[REDACTED:password-input]");
    expect(
      context.privacyReport.redactions.some((entry) => entry.patternId === "password-input"),
    ).toBe(true);
  });

  it("masks a low-entropy autocomplete credential field", () => {
    const inputs = makeInputs({
      selection: makeSelection({
        tagName: "input",
        attributes: [
          { name: "type", value: "text" },
          { name: "autocomplete", value: "current-password" },
          { name: "value", value: "1234" },
        ],
      }),
    });
    expect(renderJson(redactContext(compileContext(inputs)))).not.toContain('"1234"');
    expect(
      compileContext(inputs).privacyReport.redactions.some(
        (entry) => entry.patternId === "autocomplete-current-password",
      ),
    ).toBe(true);
  });

  it("excludes data-private content", () => {
    const context = redactContext(
      compileContext(
        makeInputs({
          selection: makeSelection({
            tagName: "div",
            attributes: [
              { name: "data-private", value: "" },
              { name: "id", value: "ssn" },
            ],
            textContentPreview: "VC_PRIVATE_SSN_LEAK",
          }),
        }),
      ),
    );
    expect(renderJson(context)).not.toContain("VC_PRIVATE_SSN_LEAK");
    expect(context.target.attributes.some((attribute) => attribute.name === "data-private")).toBe(
      false,
    );
    expect(context.target.semantic.textContentPreview).toBe("[REDACTED:data-private]");
    expect(
      context.privacyReport.redactions.some((entry) => entry.patternId === "data-private"),
    ).toBe(true);
  });

  it("applies user-supplied selectors", () => {
    const context = redactContext(
      compileContext(
        makeInputs({
          selection: makeSelection({
            tagName: "input",
            attributes: [
              { name: "type", value: "text" },
              { name: "name", value: "otp" },
              { name: "value", value: "VC_OTP_CODE" },
            ],
          }),
          redactionConfig: {
            redactionSelectors: [
              {
                id: "custom-otp",
                description: "internal OTP field",
                match: { tagName: "input", attributes: { name: "otp" } },
                action: "mask-value",
              },
            ],
          },
        }),
      ),
    );
    expect(renderJson(context)).not.toContain("VC_OTP_CODE");
    expect(renderJson(context)).toContain("[REDACTED:custom-otp]");
  });

  it("applies selector masking as defense in depth", () => {
    const raw = compileContext(
      makeInputs({
        selection: makeSelection({
          tagName: "input",
          attributes: [
            { name: "type", value: "password" },
            { name: "value", value: "VC_DEFENSE_IN_DEPTH" },
          ],
        }),
      }),
    );
    const tampered = {
      ...raw,
      target: {
        ...raw.target,
        attributes: raw.target.attributes.map((attribute) =>
          attribute.name === "value"
            ? { name: attribute.name, value: "VC_DEFENSE_IN_DEPTH" }
            : attribute,
        ),
      },
      privacyReport: { redactions: [], totalRedacted: 0 },
    };
    const redacted = redactContext(tampered);
    expect(renderJson(redacted)).not.toContain("VC_DEFENSE_IN_DEPTH");
    expect(
      redacted.privacyReport.redactions.some((entry) => entry.patternId === "password-input"),
    ).toBe(true);
  });

  it("keeps storage, cookie, and auth data out of the schema", () => {
    const keys = Object.keys(CompiledContextSchema.shape);
    expect(
      keys.filter((key) => /localStorage|sessionStorage|cookie|authorization/i.test(key)),
    ).toEqual([]);
  });

  it("exposes screenshot metadata without image data fields", () => {
    const keys = Object.keys(CompiledContextSchema.shape);
    expect(
      keys.filter((key) =>
        /image|picture|snapshot-data|screenshot-blob|screenshot-data/i.test(key),
      ),
    ).toEqual([]);
    expect(keys).toContain("screenshotRef");
  });
});
