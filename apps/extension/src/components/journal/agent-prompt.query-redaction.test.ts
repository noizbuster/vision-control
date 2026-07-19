import { createJournal } from "@vision-control/change-journal";
import { REDACTED_MARKER } from "@vision-control/security";
import { describe, expect, it } from "vitest";

import { buildAgentPrompt } from "./agent-prompt.js";

const generateLowEntropyCredential = (): string => String.fromCodePoint(97).repeat(8);

describe("buildAgentPrompt query redaction", () => {
  it("does not expose a low-entropy credential from the inspected URL", () => {
    const generatedCredential = generateLowEntropyCredential();
    const inspectedUrl = `https://example.test/v1/items?mode=inspect&token=${generatedCredential}&limit=5#sessionToken=${generatedCredential}`;

    const prompt = buildAgentPrompt({
      inspectedUrl,
      selection: null,
      journal: createJournal(),
      compiledAt: 1_700_000_000_000,
    });

    expect({
      leaked: prompt.includes(generatedCredential),
      markerSeen: prompt.includes(REDACTED_MARKER),
    }).toEqual({ leaked: false, markerSeen: true });
  });
});
