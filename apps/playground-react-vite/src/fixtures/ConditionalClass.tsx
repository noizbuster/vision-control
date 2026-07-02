import type { ReactElement } from "react";
import { useState } from "react";

export function ConditionalClass(): ReactElement {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="p-6">
      <button
        type="button"
        onClick={() => setIsActive((previous) => !previous)}
        className={`rounded px-4 py-2 text-white ${isActive ? "bg-green-500" : "bg-red-500"}`}
      >
        Toggle state
      </button>
    </div>
  );
}
