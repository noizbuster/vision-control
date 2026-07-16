import type { ReactElement, ReactNode } from "react";

export interface CollapsibleSectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly id?: string;
}

/**
 * Inspector section chrome with progressive disclosure.
 * Native details/summary for keyboard + screen-reader support.
 */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  id,
}: CollapsibleSectionProps): ReactElement {
  return (
    <details
      className="inspector-section inspector-section--collapsible"
      open={defaultOpen}
      {...(id !== undefined ? { id } : {})}
      data-section-title={title}
    >
      <summary className="inspector-section__header inspector-section__summary">{title}</summary>
      <div className="inspector-section__body">{children}</div>
    </details>
  );
}
