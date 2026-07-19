import { describe, expect, it } from "vitest";

import { REDACTED_MARKER, redactObject, redactString, shannonEntropy } from "./index.js";

const CREDENTIAL_QUERY_KEYS = [
  "pass",
  "password",
  "passwd",
  "pwd",
  "secret",
  "secrets",
  "token",
  "tokens",
  "access_token",
  "accessToken",
  "refresh_token",
  "authToken",
  "id_token",
  "api_key",
  "apiKeys",
  "api-secret",
  "clientSecret",
  "credential",
  "credentials",
  "cookie",
  "cookies",
  "authorization",
  "authorisation",
  "privateKey",
  "access_key",
  "secretKey",
] as const;

const generateLowEntropyCredential = (): string => String.fromCodePoint(97).repeat(8);

const COMPOUND_CREDENTIAL_NAMES = [
  "sessionToken",
  "pairToken",
  "dataToken",
  "session_token",
  "authorizationHeader",
  "tokenValue",
] as const;

describe("credential query redaction", () => {
  it("redacts exact credential query keys when their values have low entropy", () => {
    const generatedCredential = generateLowEntropyCredential();

    const allContextsRedacted = CREDENTIAL_QUERY_KEYS.every((key) => {
      const queryOutput = redactString(
        `https://example.test/v1/items?mode=inspect&${key}=${generatedCredential}&limit=5#summary`,
      );
      const parsed = new URL(queryOutput);
      const objectOutput = JSON.stringify(redactObject({ [key]: generatedCredential }));
      return (
        !queryOutput.includes(generatedCredential) &&
        !objectOutput.includes(generatedCredential) &&
        parsed.origin === "https://example.test" &&
        parsed.pathname === "/v1/items" &&
        parsed.searchParams.get("mode") === "inspect" &&
        parsed.searchParams.get("limit") === "5" &&
        parsed.searchParams.get(key)?.includes(REDACTED_MARKER) === true &&
        parsed.hash === "#summary"
      );
    });

    expect(shannonEntropy(generatedCredential)).toBe(0);
    expect(allContextsRedacted).toBe(true);
  });

  it("preserves endpoint structure and unrelated query parameters", () => {
    const generatedCredential = generateLowEntropyCredential();
    const source = `https://example.test/v1/items?mode=inspect&token=${generatedCredential}&limit=5#summary`;

    const redacted = redactString(source);
    const nested = JSON.stringify(redactObject({ sourceUrl: source }));

    expect({
      directLeak: redacted.includes(generatedCredential),
      nestedLeak: nested.includes(generatedCredential),
      endpointRetained: redacted.startsWith("https://example.test/v1/items?mode=inspect&token="),
      safeSuffixRetained: redacted.endsWith("&limit=5#summary"),
      markerSeen: redacted.includes(REDACTED_MARKER),
    }).toEqual({
      directLeak: false,
      nestedLeak: false,
      endpointRetained: true,
      safeSuffixRetained: true,
      markerSeen: true,
    });
  });

  it("leaves similar non-credential query keys unchanged", () => {
    const safeQuery = "tokenized=public&not_token=public&secretary=public";
    const safeSerialized = String.raw`{"token budget":"public","token.estimate":"public","token\u0020registry":"public"}`;
    const safeMetadata = {
      tokenBudget: 4096,
      tokenEstimate: 1024,
      tokenRegistry: { totalTokens: 42 },
    };

    expect(redactString(safeQuery)).toBe(safeQuery);
    expect(redactString(safeSerialized)).toBe(safeSerialized);
    expect(redactObject(safeMetadata)).toEqual(safeMetadata);
  });

  it("recognizes percent-encoded credential query keys without rewriting the key", () => {
    const generatedCredential = generateLowEntropyCredential();
    const encodedKey = "to%6Ben";
    const source = `https://example.test/v1/items?${encodedKey}=${generatedCredential}&mode=inspect`;

    const redacted = redactString(source);

    expect({
      leaked: redacted.includes(generatedCredential),
      keyRetained: redacted.includes(`${encodedKey}=`),
      markerSeen: redacted.includes(REDACTED_MARKER),
      safeParameterRetained: redacted.endsWith("&mode=inspect"),
    }).toEqual({
      leaked: false,
      keyRetained: true,
      markerSeen: true,
      safeParameterRetained: true,
    });
  });

  it("is idempotent after redacting a credential query value", () => {
    const generatedCredential = generateLowEntropyCredential();
    const once = redactString(`token=${generatedCredential}&mode=inspect`);

    expect(redactString(once) === once).toBe(true);
  });

  it("redacts compound credential-shaped object keys and assignments", () => {
    const generatedCredential = generateLowEntropyCredential();
    const fields = Object.fromEntries(
      COMPOUND_CREDENTIAL_NAMES.map((key) => [key, generatedCredential]),
    );
    const assignments = COMPOUND_CREDENTIAL_NAMES.map(
      (key) => `${key}=${generatedCredential}`,
    ).join(" ");

    const objectOutput = JSON.stringify(redactObject(fields));
    const textOutput = redactString(assignments);

    expect({
      objectLeak: objectOutput.includes(generatedCredential),
      textLeak: textOutput.includes(generatedCredential),
      objectMarker: objectOutput.includes(REDACTED_MARKER),
      textMarker: textOutput.includes(REDACTED_MARKER),
    }).toEqual({ objectLeak: false, textLeak: false, objectMarker: true, textMarker: true });
  });

  it("redacts credential fields serialized inside arbitrary text", () => {
    const generatedCredential = generateLowEntropyCredential();
    const serializedInputs = [
      JSON.stringify({ token: generatedCredential }),
      JSON.stringify({ "to%6Ben": generatedCredential }),
      JSON.stringify({ "to%256Ben": generatedCredential }),
      `{token: "${generatedCredential}"}`,
      `token: ${generatedCredential}`,
      JSON.stringify({ token: `aa'aaaaa` }),
      `secret: aa:aaaaa`,
    ];

    const redacted = serializedInputs.map((input) => redactString(input)).join("\n");

    expect({
      leaked: redacted.includes(generatedCredential),
      apostropheLeak: redacted.includes(`aa'aaaaa`),
      colonLeak: redacted.includes(`aa:aaaaa`),
      markerSeen: redacted.includes(REDACTED_MARKER),
    }).toEqual({ leaked: false, apostropheLeak: false, colonLeak: false, markerSeen: true });
  });

  it("redacts dotted, spaced, and JSON Unicode-escaped compound credential fields", () => {
    const generatedCredential = generateLowEntropyCredential();
    const serializedInputs = [
      JSON.stringify({ "session.token": generatedCredential }),
      JSON.stringify({ "session token": generatedCredential }),
      String.raw`{"session\u0054oken":"${generatedCredential}"}`,
    ];

    const redacted = serializedInputs.map((input) => redactString(input));

    expect({
      leakedCount: redacted.filter((input) => input.includes(generatedCredential)).length,
      markerCount: redacted.filter((input) => input.includes(REDACTED_MARKER)).length,
    }).toEqual({ leakedCount: 0, markerCount: serializedInputs.length });
  });
});
