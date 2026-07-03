/**
 * Shared helpers for MCP tool handlers.
 *
 * Every tool response passes through {@link redactObject} from
 * `@vision-control/security` before leaving the server boundary. This is the
 * single chokepoint enforcing "no secrets in MCP responses" (PRD Appendix D.6,
 * docs/agents/security-privacy.md).
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { redactObject } from "@vision-control/security";

/**
 * Build a success {@link CallToolResult} from arbitrary data. The data is
 * deep-redacted, then JSON-stringified into a text content block.
 */
export const textResult = (data: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(redactObject(data), null, 2) }],
});

/**
 * Build an error {@link CallToolResult} from a message string.
 * Error messages are also redacted (they may echo user input).
 */
export const errorResult = (message: string): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(redactObject({ error: message })) }],
  isError: true,
});
