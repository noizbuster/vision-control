import type {
  SetChildSizingOperation,
  SetContainerLayoutOperation,
} from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import {
  AUTO_LAYOUT_ALIGN_CROSS,
  AUTO_LAYOUT_ALIGN_MAIN,
  AUTO_LAYOUT_DIRECTIONS,
  AUTO_LAYOUT_WRAP,
  type AutoLayoutAlignCross,
  type AutoLayoutAlignMain,
  type AutoLayoutDirection,
  type AutoLayoutWrap,
  isAutoLayoutSupported,
  type TokenSuggestionProvider,
} from "@vision-control/layout-engine";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import {
  buildAutoLayoutOperations,
  deriveAutoLayoutContainerContext,
  toElementRefFromIdentity,
} from "./auto-layout-operations.js";
import {
  AutoLayoutField,
  AutoLayoutSelectControl,
  AutoLayoutTokenHint,
} from "./auto-layout-panel-controls.js";

interface AutoLayoutPanelProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (operation: SetContainerLayoutOperation | SetChildSizingOperation) => void;
  readonly tokenProviders?: readonly TokenSuggestionProvider[];
}

export function AutoLayoutPanel({
  summary,
  onCommand,
  tokenProviders = [],
}: AutoLayoutPanelProps): ReactElement {
  const container = useMemo(
    () =>
      deriveAutoLayoutContainerContext(
        summary.computedStyle.display,
        summary.computedStyle.flexDirection,
      ),
    [summary],
  );
  const elementRef = useMemo(() => toElementRefFromIdentity(summary.identity), [summary]);

  const [gapValue, setGapValue] = useState("");
  const [paddingValue, setPaddingValue] = useState("");
  const [paddingMode, setPaddingMode] = useState<"all" | "horizontal" | "vertical" | "individual">(
    "all",
  );
  const [direction, setDirection] = useState<AutoLayoutDirection>("row");
  const [alignMain, setAlignMain] = useState<AutoLayoutAlignMain>("flex-start");
  const [alignCross, setAlignCross] = useState<AutoLayoutAlignCross>("stretch");
  const [wrap, setWrap] = useState<AutoLayoutWrap>("nowrap");
  const [childIndex, setChildIndex] = useState(0);
  const [childIntent, setChildIntent] = useState<"hug" | "fill" | "fixed">("hug");
  const [childValue, setChildValue] = useState("");

  if (!isAutoLayoutSupported(container)) {
    return (
      <div className="auto-layout auto-layout--unsupported" data-testid="auto-layout-unsupported">
        <p className="auto-layout__diagnostic">
          Auto Layout is not available for this element ({container.layoutRole}). Select a flex or
          grid container to edit its layout.
        </p>
      </div>
    );
  }

  const isFlex = container.layoutRole === "flex-container";

  const emit = (command: Parameters<typeof buildAutoLayoutOperations>[0]["command"]): void => {
    const result = buildAutoLayoutOperations({
      command,
      container,
      containerRef: elementRef,
      origin: "property-panel",
    });
    if (!result.ok) return;
    for (const operation of result.operations) {
      onCommand(operation);
    }
  };

  return (
    <div className="auto-layout" data-testid="auto-layout-panel" data-vc-auto-layout-host>
      <div className="auto-layout__header">
        <span className="auto-layout__role">{container.layoutRole}</span>
      </div>

      {isFlex && (
        <AutoLayoutField label="Direction">
          <AutoLayoutSelectControl
            value={direction}
            options={AUTO_LAYOUT_DIRECTIONS}
            onChange={(dir) => {
              setDirection(dir);
              emit({ kind: "set-direction", direction: dir });
            }}
            testId="auto-layout-direction"
          />
        </AutoLayoutField>
      )}

      <AutoLayoutField label="Gap">
        <input
          type="text"
          placeholder="e.g. 1rem"
          value={gapValue}
          onChange={(e) => setGapValue(e.target.value)}
          data-testid="auto-layout-gap-input"
        />
        <button
          type="button"
          onClick={() => emit({ kind: "set-gap", value: gapValue })}
          data-testid="auto-layout-gap-apply"
        >
          Apply
        </button>
        {gapValue.trim() !== "" && (
          <AutoLayoutTokenHint providers={tokenProviders} property="gap" value={gapValue.trim()} />
        )}
      </AutoLayoutField>

      <AutoLayoutField label="Padding">
        <AutoLayoutSelectControl
          value={paddingMode}
          options={["all", "horizontal", "vertical", "individual"]}
          onChange={setPaddingMode}
          testId="auto-layout-padding-mode"
        />
        <input
          type="text"
          placeholder="e.g. 8px"
          value={paddingValue}
          onChange={(e) => setPaddingValue(e.target.value)}
          data-testid="auto-layout-padding-input"
        />
        <button
          type="button"
          onClick={() => {
            if (paddingMode === "individual") return;
            emit({ kind: "set-padding", mode: paddingMode, value: paddingValue });
          }}
          data-testid="auto-layout-padding-apply"
        >
          Apply
        </button>
      </AutoLayoutField>

      {isFlex && (
        <>
          <AutoLayoutField label="Main Align">
            <AutoLayoutSelectControl
              value={alignMain}
              options={AUTO_LAYOUT_ALIGN_MAIN}
              onChange={(val) => {
                setAlignMain(val);
                emit({ kind: "set-align-main", value: val });
              }}
              testId="auto-layout-align-main"
            />
          </AutoLayoutField>
          <AutoLayoutField label="Cross Align">
            <AutoLayoutSelectControl
              value={alignCross}
              options={AUTO_LAYOUT_ALIGN_CROSS}
              onChange={(val) => {
                setAlignCross(val);
                emit({ kind: "set-align-cross", value: val });
              }}
              testId="auto-layout-align-cross"
            />
          </AutoLayoutField>
          <AutoLayoutField label="Wrap">
            <AutoLayoutSelectControl
              value={wrap}
              options={AUTO_LAYOUT_WRAP}
              onChange={(val) => {
                setWrap(val);
                emit({ kind: "set-wrap", value: val });
              }}
              testId="auto-layout-wrap"
            />
          </AutoLayoutField>
        </>
      )}

      <AutoLayoutField label="Child Sizing">
        <input
          type="number"
          min={0}
          value={childIndex}
          onChange={(e) => setChildIndex(Number(e.target.value))}
          data-testid="auto-layout-child-index"
        />
        <AutoLayoutSelectControl
          value={childIntent}
          options={["hug", "fill", "fixed"]}
          onChange={setChildIntent}
          testId="auto-layout-child-intent"
        />
        {childIntent === "fixed" && (
          <input
            type="text"
            placeholder="e.g. 200px"
            value={childValue}
            onChange={(e) => setChildValue(e.target.value)}
            data-testid="auto-layout-child-value"
          />
        )}
        <button
          type="button"
          onClick={() =>
            emit({
              kind: "set-child-sizing",
              childIndex,
              intent: childIntent,
              ...(childIntent === "fixed" && childValue.trim() !== ""
                ? { value: childValue.trim() }
                : {}),
            })
          }
          data-testid="auto-layout-child-apply"
        >
          Apply
        </button>
      </AutoLayoutField>
    </div>
  );
}
