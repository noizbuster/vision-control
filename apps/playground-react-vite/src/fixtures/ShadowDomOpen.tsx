import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

export function ShadowDomOpen(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || host.shadowRoot !== null) {
      return;
    }

    const shadow = host.attachShadow({ mode: "open" });
    const button = document.createElement("button");
    button.textContent = "Inside open shadow root";
    button.className = "rounded bg-teal-600 px-4 py-2 text-white";
    shadow.appendChild(button);
  }, []);

  return <div ref={hostRef} className="shadow-host" data-testid="shadow-open-host" />;
}
