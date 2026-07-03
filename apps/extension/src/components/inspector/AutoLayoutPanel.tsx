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
  type AutoLayoutContainerContext,
  type AutoLayoutDirection,
  type AutoLayoutWrap,
  isAutoLayoutSupported,
  resolveAutoLayoutCandidate,
  suggestTokens,
  type TokenSuggestionProvider,
} from "@vision-control/layout-engine";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

interface AutoLayoutPanelProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (operation: SetContainerLayoutOperation | SetChildSizingOperation) => void;
  readonly tokenProviders?: readonly TokenSuggestionProvider[];
}

function deriveContainerContext(summary: SelectionSummary): AutoLayoutContainerContext {
  const display = summary.computedStyle.display;
  const flexDirection = summary.computedStyle.flexDirection;
  if (display === "flex") {
    const role = flexDirection.startsWith("column") ? "flex-column" : "flex-row";
    return { layoutRole: role, display, flexDirection };
  }
  if (display === "grid") return { layoutRole: "grid", display, flexDirection };
  if (display === "inline" || display === "inline-block") {
    return { layoutRole: display as "inline" | "inline-block", display, flexDirection };
  }
  if (display === "block" || display === "list-item" || display === "flow-root") {
    return { layoutRole: "block", display, flexDirection };
  }
  return { layoutRole: "unknown", display, flexDirection };
}

function toElementRef(summary: SelectionSummary): SetContainerLayoutOperation["container"] {
  const id = summary.identity;
  return {
    runtimeId: id.runtimeId,
    ...(id.sourceId !== undefined ? { sourceId: id.sourceId } : {}),
    ...(id.selector !== undefined ? { selector: id.selector } : {}),
  };
}

function newId(): string {
  return crypto.randomUUID();
}

function Field({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="auto-layout__field">
      <span className="auto-layout__label">{label}</span>
      <div className="auto-layout__control">{children}</div>
    </div>
  );
}

function TokenHint({
  providers,
  property,
  value,
}: {
  providers: readonly TokenSuggestionProvider[];
  property: string;
  value: string;
}): ReactElement | null {
  const suggestions = suggestTokens(providers, property, value);
  if (suggestions.length === 0) return null;
  const best = suggestions[0];
  return (
    <span className="auto-layout__token-hint" title={best?.rawValue ?? ""}>
      {" "}
      ≈ {best?.utility}
    </span>
  );
}

function SelectControl<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  testId: string;
}): ReactElement {
  return (
    <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

export function AutoLayoutPanel({
  summary,
  onCommand,
  tokenProviders = [],
}: AutoLayoutPanelProps): ReactElement {
  const container = useMemo(() => deriveContainerContext(summary), [summary]);
  const elementRef = useMemo(() => toElementRef(summary), [summary]);

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

  const isFlex = container.layoutRole === "flex-row" || container.layoutRole === "flex-column";

  const handleDirection = (dir: AutoLayoutDirection): void => {
    setDirection(dir);
    onCommand({
      id: newId(),
      kind: "set-container-layout",
      container: elementRef,
      property: "flex-direction",
      value: dir,
      timestamp: Date.now(),
      runtime: false,
    });
  };

  const handleGap = (): void => {
    if (gapValue.trim() === "") return;
    onCommand({
      id: newId(),
      kind: "set-container-layout",
      container: elementRef,
      property: "gap",
      value: gapValue.trim(),
      timestamp: Date.now(),
      runtime: false,
    });
  };

  const handlePadding = (): void => {
    if (paddingMode === "individual") return;
    if (paddingValue.trim() === "") return;
    const result = resolveAutoLayoutCandidate(
      { kind: "set-padding", mode: paddingMode, value: paddingValue.trim() },
      container,
    );
    if (!result.resolved) return;
    for (const candidate of result.candidates) {
      if (candidate.kind !== "container-layout") continue;
      onCommand({
        id: newId(),
        kind: "set-container-layout",
        container: elementRef,
        property: candidate.property,
        value: candidate.value,
        timestamp: Date.now(),
        runtime: false,
      });
    }
  };

  const handleAlignMain = (val: AutoLayoutAlignMain): void => {
    setAlignMain(val);
    onCommand({
      id: newId(),
      kind: "set-container-layout",
      container: elementRef,
      property: "justify-content",
      value: val,
      timestamp: Date.now(),
      runtime: false,
    });
  };

  const handleAlignCross = (val: AutoLayoutAlignCross): void => {
    setAlignCross(val);
    onCommand({
      id: newId(),
      kind: "set-container-layout",
      container: elementRef,
      property: "align-items",
      value: val,
      timestamp: Date.now(),
      runtime: false,
    });
  };

  const handleWrap = (val: AutoLayoutWrap): void => {
    setWrap(val);
    onCommand({
      id: newId(),
      kind: "set-container-layout",
      container: elementRef,
      property: "flex-wrap",
      value: val,
      timestamp: Date.now(),
      runtime: false,
    });
  };

  const handleChildSizing = (): void => {
    const result = resolveAutoLayoutCandidate(
      {
        kind: "set-child-sizing",
        childIndex,
        intent: childIntent,
        ...(childIntent === "fixed" && childValue.trim() !== ""
          ? { value: childValue.trim() }
          : {}),
      },
      container,
    );
    if (!result.resolved) return;
    const sizingCandidate = result.candidates.find((c) => c.kind === "child-sizing");
    if (sizingCandidate?.kind !== "child-sizing") return;
    const declarations = sizingCandidate.declarations
      .map((d) => `${d.property}: ${d.value}`)
      .join("; ");
    const op: SetChildSizingOperation = {
      id: newId(),
      kind: "set-child-sizing",
      container: elementRef,
      childIndex,
      child: elementRef,
      sizing: childIntent,
      timestamp: Date.now(),
      runtime: false,
      ...(declarations !== "" ? { value: declarations } : {}),
    };
    onCommand(op);
  };

  return (
    <div className="auto-layout" data-testid="auto-layout-panel" data-vc-auto-layout-host>
      <div className="auto-layout__header">
        <span className="auto-layout__role">{container.layoutRole}</span>
      </div>

      {isFlex && (
        <Field label="Direction">
          <SelectControl
            value={direction}
            options={AUTO_LAYOUT_DIRECTIONS}
            onChange={handleDirection}
            testId="auto-layout-direction"
          />
        </Field>
      )}

      <Field label="Gap">
        <input
          type="text"
          placeholder="e.g. 1rem"
          value={gapValue}
          onChange={(e) => setGapValue(e.target.value)}
          data-testid="auto-layout-gap-input"
        />
        <button type="button" onClick={handleGap} data-testid="auto-layout-gap-apply">
          Apply
        </button>
        {gapValue.trim() !== "" && (
          <TokenHint providers={tokenProviders} property="gap" value={gapValue.trim()} />
        )}
      </Field>

      <Field label="Padding">
        <SelectControl
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
        <button type="button" onClick={handlePadding} data-testid="auto-layout-padding-apply">
          Apply
        </button>
      </Field>

      {isFlex && (
        <>
          <Field label="Main Align">
            <SelectControl
              value={alignMain}
              options={AUTO_LAYOUT_ALIGN_MAIN}
              onChange={handleAlignMain}
              testId="auto-layout-align-main"
            />
          </Field>

          <Field label="Cross Align">
            <SelectControl
              value={alignCross}
              options={AUTO_LAYOUT_ALIGN_CROSS}
              onChange={handleAlignCross}
              testId="auto-layout-align-cross"
            />
          </Field>

          <Field label="Wrap">
            <SelectControl
              value={wrap}
              options={AUTO_LAYOUT_WRAP}
              onChange={handleWrap}
              testId="auto-layout-wrap"
            />
          </Field>
        </>
      )}

      <Field label="Child Sizing">
        <input
          type="number"
          min={0}
          value={childIndex}
          onChange={(e) => setChildIndex(Number(e.target.value))}
          data-testid="auto-layout-child-index"
        />
        <SelectControl
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
        <button type="button" onClick={handleChildSizing} data-testid="auto-layout-child-apply">
          Apply
        </button>
      </Field>
    </div>
  );
}
