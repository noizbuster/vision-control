"use client";

import { useState } from "react";

export default function ClientCounter() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter">
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}
