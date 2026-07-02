import type { ReactElement } from "react";

export function SameOriginIframe(): ReactElement {
  return (
    <div className="p-6">
      <iframe
        src="/iframe-content.html"
        title="Same-origin iframe"
        className="h-64 w-full rounded border border-slate-300"
      />
    </div>
  );
}
