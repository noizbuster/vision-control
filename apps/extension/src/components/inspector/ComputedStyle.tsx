import type { ComputedStyleSummary } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface ComputedStyleProps {
  readonly style: ComputedStyleSummary;
}

type Entry = { readonly key: string; readonly value: string };

function groupEntries(
  style: ComputedStyleSummary,
): readonly (Entry | { readonly group: string })[] {
  return [
    { group: "Layout" },
    { key: "display", value: style.display },
    { key: "position", value: style.position },
    { key: "width", value: style.width },
    { key: "height", value: style.height },
    { group: "Flex" },
    { key: "flexDirection", value: style.flexDirection },
    { key: "alignItems", value: style.alignItems },
    { key: "justifyContent", value: style.justifyContent },
    { key: "flexBasis", value: style.flexBasis },
    { key: "flexGrow", value: style.flexGrow },
    { group: "Spacing" },
    { key: "padding", value: style.padding },
    { key: "margin", value: style.margin },
    { key: "border", value: style.border },
    { group: "Colors" },
    { key: "color", value: style.color },
    { key: "backgroundColor", value: style.backgroundColor },
    { group: "Typography" },
    { key: "fontSize", value: style.fontSize },
    { key: "fontWeight", value: style.fontWeight },
    { key: "lineHeight", value: style.lineHeight },
  ];
}

export function ComputedStyle({ style }: ComputedStyleProps): ReactElement {
  return (
    <div className="inspector-kv-grid">
      {groupEntries(style).map((entry) => {
        if ("group" in entry) {
          return (
            <div key={entry.group} className="inspector-kv-grid__group">
              {entry.group}
            </div>
          );
        }
        return (
          <div key={entry.key} className="inspector-kv-grid__row">
            <span className="inspector-kv-grid__key">{entry.key}</span>
            <span className="inspector-kv-grid__value">{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}
