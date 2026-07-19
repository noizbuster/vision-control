import { type ProtocolEnvelope, parseEnvelope } from "@vision-control/protocol";

export function parseIncoming(data: string): ProtocolEnvelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  const result = parseEnvelope(parsed);
  return result.success ? result.data : undefined;
}
