import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function PortalCase(): ReactElement {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="p-6">Portal target loading...</div>;
  }

  return createPortal(
    <div className="rounded bg-purple-600 p-4 text-white">Rendered through a portal</div>,
    document.body,
  );
}
