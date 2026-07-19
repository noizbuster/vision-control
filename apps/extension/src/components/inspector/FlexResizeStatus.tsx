import type { ReactElement } from "react";

import type { FlexResizeStatus as FlexResizeStatusState } from "../../messaging/resize-messages.js";

interface FlexResizeStatusProps {
  readonly status: FlexResizeStatusState | null;
}

function labelFor(status: FlexResizeStatusState): string {
  switch (status.kind) {
    case "valid":
      return "Paired resize ready";
    case "active":
      return "Resizing paired items";
    case "disabled-edge":
    case "blocked":
      return status.message;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function FlexResizeStatus({ status }: FlexResizeStatusProps): ReactElement | null {
  if (status === null) return null;

  const isAlert = status.kind === "disabled-edge" || status.kind === "blocked";
  return (
    <section
      className={`flex-resize-status flex-resize-status--${status.kind}`}
      data-testid="flex-resize-status"
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? undefined : "polite"}
    >
      <h3 className="flex-resize-status__heading">Resize</h3>
      <p className="flex-resize-status__message">{labelFor(status)}</p>
    </section>
  );
}
