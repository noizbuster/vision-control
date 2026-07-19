import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { REDACTED_MARKER } from "@vision-control/security";
import { describe, expect, it } from "vitest";

import { createMcpServer, createStubDeps } from "./index.js";

const generateLowEntropyCredential = (): string => String.fromCodePoint(97).repeat(8);

describe("MCP tool output query redaction", () => {
  it("redacts low-entropy credential query values from a public tool response", async () => {
    const generatedCredentials = ["a", "b", "c", "d"].map((character) =>
      character.repeat(generateLowEntropyCredential().length),
    );
    const [
      queryCredential = "",
      dottedCredential = "",
      spacedCredential = "",
      escapedCredential = "",
    ] = generatedCredentials;
    const serializedCredential = JSON.stringify({
      sessionToken: queryCredential,
      "to%6Ben": queryCredential,
      "session.token": dottedCredential,
      "session token": spacedCredential,
    });
    const escapedCredentialField = String.raw`{"session\u0054oken":"${escapedCredential}"}`;
    const textPreview = `https://example.test/v1/items?mode=inspect&token=${queryCredential}&limit=5#summary ${serializedCredential} ${escapedCredentialField}`;
    const server = createMcpServer({
      ...createStubDeps(),
      async getSelection() {
        return {
          sessionId: "session-query-redaction",
          elementTag: "a",
          selector: "#target",
          sourceId: undefined,
          textPreview,
        };
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "query-redaction-test", version: "1.0.0" });
    await client.connect(clientTransport);

    const result = await client.callTool({ name: "vision_get_selection", arguments: {} });
    const serialized = JSON.stringify(result);

    expect({
      leakedCount: generatedCredentials.filter((credential) => serialized.includes(credential))
        .length,
      endpointRetained: serialized.includes("https://example.test/v1/items?mode=inspect&token="),
      safeSuffixRetained: serialized.includes("&limit=5#summary"),
      markerSeen: serialized.includes(REDACTED_MARKER),
    }).toEqual({
      leakedCount: 0,
      endpointRetained: true,
      safeSuffixRetained: true,
      markerSeen: true,
    });
  });
});
