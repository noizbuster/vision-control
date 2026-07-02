import type { BreadcrumbItem } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface BreadcrumbProps {
  readonly items: readonly BreadcrumbItem[];
  readonly onSelect: (selector: string) => void;
}

export function Breadcrumb({ items, onSelect }: BreadcrumbProps): ReactElement {
  return (
    <nav aria-label="Element breadcrumb">
      <ol className="inspector-breadcrumb">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const canSelect = item.selector !== undefined && item.selector.length > 0;
          return (
            <li key={index} className="inspector-breadcrumb__item-wrapper">
              <button
                type="button"
                className={`inspector-breadcrumb__item ${isLast ? "inspector-breadcrumb__item--current" : ""}`}
                disabled={!canSelect}
                onClick={() => {
                  if (item.selector !== undefined) {
                    onSelect(item.selector);
                  }
                }}
                aria-current={isLast ? "location" : undefined}
              >
                <span className="inspector-tag">{item.tagName}</span>
                {item.id !== undefined && item.id.length > 0 && (
                  <span className="inspector-id">#{item.id}</span>
                )}
                {item.role !== undefined && item.role.length > 0 && (
                  <span className="inspector-role">[{item.role}]</span>
                )}
              </button>
              {!isLast && <span className="inspector-breadcrumb__separator">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
