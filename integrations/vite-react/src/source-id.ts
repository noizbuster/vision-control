import { createHash } from "node:crypto";
import path from "node:path";

import { normalizePath } from "./match.js";

/**
 * Opaque source-id generation (PRD 14.1).
 *
 * A source id is a SHORT, OPAQUE token baked into the `data-vc-source`
 * attribute. It MUST NOT contain the filename, any path component, or anything
 * human-readable: it crosses the wire (extension -> daemon) and is persisted,
 * so an absolute path would leak the developer's machine layout. The id is a
 * truncated SHA-256 (base64url) over the canonical `relativePath:range`
 * string, so the same JSX location always reproduces the same id while a
 * different location or fingerprint yields a different one.
 *
 * The workspace-relative path is computed ONCE from the absolute Vite module
 * `id` (the plugin never embeds the absolute path anywhere). The registry's
 * boundary schema independently rejects any id that looks like a path, so a
 * leak fails loudly at two layers.
 */

export interface SourceRangeInput {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SourceIdInput {
  readonly workspaceRelativePath: string;
  readonly range: SourceRangeInput;
  readonly fingerprint: string;
}

/** Strip the workspace root from an absolute Vite module id, POSIX-normalized. */
export const computeWorkspaceRelativePath = (
  absoluteFilePath: string,
  workspaceRoot: string,
): string => normalizePath(path.relative(workspaceRoot, absoluteFilePath));

const canonical = (input: SourceIdInput): string =>
  [
    input.workspaceRelativePath,
    input.range.startLine,
    input.range.startColumn,
    input.range.endLine,
    input.range.endColumn,
    input.fingerprint,
  ].join(":");

/**
 * Generate an opaque source id. SHA-256 over the canonical string, truncated
 * to 12 bytes (96 bits) and base64url-encoded (16 chars, no `/`). Two inputs
 * that differ in path, range, OR fingerprint produce different ids — the
 * fingerprint is what disambiguates two distinct elements that happen to share
 * a location (collision resistance).
 */
export const generateSourceId = (input: SourceIdInput): string => {
  const digest = createHash("sha256").update(canonical(input)).digest();
  return digest.subarray(0, 12).toString("base64url");
};

export interface ElementFingerprintInput {
  readonly componentName: string;
  readonly staticClassName: string | undefined;
  readonly staticText: string | undefined;
  /** Raw source slice covering the whole JSX element (start..end). */
  readonly source: string;
}

/**
 * Compute an element's fingerprint: a deterministic hash of its tag name,
 * static class/text, and full source slice. Two structurally different
 * elements (different tag, attributes, or surrounding JSX) get different
 * fingerprints, which keeps their source ids distinct even if their ranges
 * overlapped.
 */
export const computeElementFingerprint = (input: ElementFingerprintInput): string => {
  const parts = [
    input.componentName,
    input.staticClassName ?? "",
    input.staticText ?? "",
    input.source,
  ].join("|");
  return createHash("sha256").update(parts).digest().subarray(0, 8).toString("hex");
};
