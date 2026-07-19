const SENSITIVE_KEY_RE =
  /^(pass(word|wd)?|pwd|secret|secrets|token|tokens|access_?token|refresh_?token|auth_?token|id_?token|api[_-]?key|api[_-]?keys|api[_-]?secret|client[_-]?secret|credential|credentials|cookie|cookies|authorization|authorisation|private_?key|access_?key|secret_?key)$/i;

const PERCENT_ENCODED_BYTE_RE = /%([0-9A-Fa-f]{2})/g;
const JSON_UNICODE_ESCAPE_RE = /\\u([0-9A-Fa-f]{4})/g;
const REDACTED_VALUE_RE = /^\[REDACTED(?::[A-Za-z0-9_-]+)*\]$/;
const QUOTED_FIELD_RE = /(["'])((?:\\.|(?!\1).)*)\1(\s*:\s*)(["'])((?:\\.|(?!\4).)*)\4/g;
const UNQUOTED_FIELD_RE =
  /(^|[^A-Za-z0-9_%.-])([A-Za-z%][A-Za-z0-9_%.-]*(?:[ \t]+[A-Za-z0-9_%.-]+)*)(\s*:\s*)(["'])((?:\\.|(?!\4).)*)\4/g;
const UNQUOTED_COLON_FIELD_RE =
  /(^|[^A-Za-z0-9_%.-])([A-Za-z%][A-Za-z0-9_%.-]*(?:[ \t]+[A-Za-z0-9_%.-]+)*)(\s*:\s*)((?!["'])[^,\s;}]+)/g;
const ASSIGNMENT_RE =
  /(^|[^A-Za-z0-9_%.-])([A-Za-z%][A-Za-z0-9_%.-]*(?:[ \t]+[A-Za-z0-9_%.-]+)*)(\s*=\s*)([^&#\s,;}]*)(?=$|[&#\s,;}])/g;

const SENSITIVE_WORDS = new Set([
  "authorization",
  "authorisation",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "pass",
  "passwd",
  "password",
  "pwd",
  "secret",
  "secrets",
  "token",
  "tokens",
]);

const SENSITIVE_WORD_PAIRS = new Set([
  "access key",
  "api key",
  "api keys",
  "api secret",
  "client secret",
  "private key",
  "secret key",
  "session key",
]);

const NON_CREDENTIAL_COMPOUNDS = new Set([
  "token budget",
  "token estimate",
  "token registry",
  "total tokens",
]);

const decodeSerializedKey = (value: string): string => {
  let decoded = value;
  let previous: string;
  do {
    previous = decoded;
    decoded = decoded
      .replace(PERCENT_ENCODED_BYTE_RE, (_encoded, hexadecimal: string) =>
        String.fromCharCode(Number.parseInt(hexadecimal, 16)),
      )
      .replace(JSON_UNICODE_ESCAPE_RE, (_encoded, hexadecimal: string) =>
        String.fromCharCode(Number.parseInt(hexadecimal, 16)),
      );
  } while (decoded !== previous);
  return decoded;
};

const keyWords = (key: string): readonly string[] =>
  decodeSerializedKey(key)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

export const isSensitiveKey = (key: string): boolean => {
  const normalizedKey = decodeSerializedKey(key);
  if (SENSITIVE_KEY_RE.test(normalizedKey)) return true;

  const words = keyWords(normalizedKey);
  if (NON_CREDENTIAL_COMPOUNDS.has(words.join(" "))) return false;
  for (const [index, word] of words.entries()) {
    if (SENSITIVE_WORDS.has(word) && words[index - 1] !== "not") return true;
    if (index > 0 && SENSITIVE_WORD_PAIRS.has(`${words[index - 1]} ${word}`)) return true;
  }
  return false;
};

export const isRedactedValue = (value: string): boolean => REDACTED_VALUE_RE.test(value);

export const redactSensitiveAssignments = (input: string): string =>
  input
    .replace(
      QUOTED_FIELD_RE,
      (
        field,
        keyQuote: string,
        key: string,
        separator: string,
        valueQuote: string,
        value: string,
      ) =>
        isSensitiveKey(key) && !isRedactedValue(value)
          ? `${keyQuote}${key}${keyQuote}${separator}${valueQuote}[REDACTED:sensitive-field]${valueQuote}`
          : field,
    )
    .replace(
      UNQUOTED_FIELD_RE,
      (field, prefix: string, key: string, separator: string, valueQuote: string, value: string) =>
        isSensitiveKey(key) && !isRedactedValue(value)
          ? `${prefix}${key}${separator}${valueQuote}[REDACTED:sensitive-field]${valueQuote}`
          : field,
    )
    .replace(
      UNQUOTED_COLON_FIELD_RE,
      (field, prefix: string, key: string, separator: string, value: string) =>
        isSensitiveKey(key) && !isRedactedValue(value)
          ? `${prefix}${key}${separator}[REDACTED:sensitive-field]`
          : field,
    )
    .replace(
      ASSIGNMENT_RE,
      (assignment, prefix: string, key: string, separator: string, value: string) =>
        isSensitiveKey(key) && !isRedactedValue(value)
          ? `${prefix}${key}${separator}[REDACTED:sensitive-assignment]`
          : assignment,
    );
