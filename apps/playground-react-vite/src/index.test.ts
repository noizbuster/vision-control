import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PrivateFields } from "./fixtures/PrivateFields.js";

describe("PrivateFields fixture", () => {
  it("renders the secret string in its output", () => {
    const html = renderToString(createElement(PrivateFields));
    expect(html).toContain("VC_SECRET_SHOULD_NOT_EXPORT");
  });
});
