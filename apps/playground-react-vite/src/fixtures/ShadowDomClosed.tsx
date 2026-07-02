import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

export function ShadowDomClosed(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    try {
      host.attachShadow({ mode: "closed" });
    } catch {
      // Shadow root already attached (e.g., StrictMode double mount).
    }
  }, []);

  return <div ref={hostRef} className="shadow-host" data-testid="shadow-closed-host" />;
}
