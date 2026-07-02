import { readFileSync } from "node:fs";

/**
 * Snippet extractor (PRD 16.2 / 16.5).
 *
 * Reads the source file and extracts a numbered code excerpt around the
 * element's source range. The snippet gives the coding agent enough context to
 * write a patch without loading the entire file into the context budget.
 *
 * Lines are 1-based and padded for alignment. Output is capped at
 * {@link MAX_SNIPPET_LINES} (20) lines to stay within the token budget. The
 * function accepts an ABSOLUTE file path (internal to the daemon) — the output
 * contains only line numbers and source text, never the path.
 */

export const MAX_SNIPPET_LINES = 20;
const DEFAULT_PADDING = 5;
const LINE_NUMBER_WIDTH = 4;

/**
 * Extract a numbered snippet from a source file around the given line range.
 *
 * @param absoluteFilePath — absolute path to the source file (internal only).
 * @param startLine — 1-based start line of the element range.
 * @param endLine — 1-based end line of the element range.
 * @param padding — extra lines of context before/after the range.
 * @returns a numbered string excerpt, or `undefined` if the file cannot be read.
 */
export const extractSnippet = (
  absoluteFilePath: string,
  startLine: number,
  endLine: number,
  padding: number = DEFAULT_PADDING,
): string | undefined => {
  let content: string;
  try {
    content = readFileSync(absoluteFilePath, "utf8");
  } catch {
    return undefined;
  }

  const lines = content.split("\n");
  const firstLine = Math.max(1, startLine - padding);
  const desiredLastLine = endLine + padding;
  const lastLine = Math.min(lines.length, desiredLastLine);

  let selected: string[];
  if (lastLine - firstLine + 1 > MAX_SNIPPET_LINES) {
    selected = lines.slice(firstLine - 1, firstLine - 1 + MAX_SNIPPET_LINES);
  } else {
    selected = lines.slice(firstLine - 1, lastLine);
  }

  return selected
    .map((line, idx) => {
      const num = firstLine + idx;
      const padded = num.toString().padStart(LINE_NUMBER_WIDTH);
      return `${padded}: ${line}`;
    })
    .join("\n");
};
