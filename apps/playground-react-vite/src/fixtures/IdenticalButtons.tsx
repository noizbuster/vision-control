import type { ReactElement } from "react";

import { IdenticalButtonsA } from "./IdenticalButtonsA.js";
import { IdenticalButtonsB } from "./IdenticalButtonsB.js";

export function IdenticalButtons(): ReactElement {
  return (
    <div className="flex gap-4 p-6">
      <IdenticalButtonsA />
      <IdenticalButtonsB />
    </div>
  );
}
