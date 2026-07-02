import { z } from "zod";

import { ProtocolEnvelopeSchema } from "./envelope.js";
import { MessageSchema } from "./message-types.js";

/**
 * A JSON Schema (Draft 2020-12) object. Plain JSON-serializable structure.
 */
export type JsonSchema202012 = Record<string, unknown>;

const ProtocolContractSchema = z.object({
  envelope: ProtocolEnvelopeSchema,
  message: MessageSchema,
});

/**
 * Generate a JSON Schema (Draft 2020-12) object describing the protocol envelope
 * and the message-type union. The result is a plain object suitable for
 * `JSON.stringify`. Uses Zod 4's first-party `z.toJSONSchema` converter — the
 * `zod-to-json-schema` package only supports Zod 3 schemas and is unmaintained,
 * so the native converter is the correct choice for Zod 4.
 */
export const generateJsonSchema = (): JsonSchema202012 =>
  z.toJSONSchema(ProtocolContractSchema, { target: "draft-2020-12" });
