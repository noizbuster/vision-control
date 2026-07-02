import type { ReactElement } from "react";

export function CrossOriginIframe(): ReactElement {
  return (
    <div className="p-6">
      <iframe
        src="https://example.com"
        title="Cross-origin iframe"
        className="h-64 w-full rounded border border-slate-300"
      />
    </div>
  );
}
