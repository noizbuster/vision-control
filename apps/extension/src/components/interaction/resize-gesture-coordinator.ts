import type { Operation } from "@vision-control/change-ir";
import type { FlexDiagnostic, ResizePropertyKind } from "@vision-control/layout-engine";
import type { ResizeHandlePosition } from "@vision-control/overlay-ui";
import type { PreviewManager } from "@vision-control/preview-engine";
import { prepareFlexPairResize } from "./flex-pair-resize-model.js";
import {
  createFlexPairResizeStrategy,
  type FlexPairResizeStrategy,
} from "./flex-pair-resize-strategy.js";
import {
  createSingleResizeTarget,
  isSingleResizeProperty,
  type SelectedElementContext,
} from "./resize-selection-context.js";
import { createSingleResizeGesture, type SingleResizeGesture } from "./single-resize-gesture.js";

export type ResizeDiagnostic =
  | { readonly kind: "invalid-resize-candidate"; readonly message: string }
  | {
      readonly kind: "flex-pair-disabled";
      readonly reason: "corner-handle";
      readonly message: string;
    }
  | {
      readonly kind: "flex-pair-rejected";
      readonly reason: FlexDiagnostic["code"];
      readonly message: string;
    };

export interface ResizeGestureCoordinatorOptions {
  readonly previewEngine: PreviewManager;
  readonly onCommit: (operation: Operation) => void;
  readonly onDiagnostic: (
    diagnostic: ResizeDiagnostic,
    handle: ResizeHandlePosition | null,
  ) => void;
}

export interface ResizeGestureBeginInput {
  readonly context: SelectedElementContext;
  readonly handleElement: HTMLElement;
  readonly handle: ResizeHandlePosition;
  readonly event: PointerEvent;
  readonly selectedProperty: ResizePropertyKind | null;
}

export interface ResizeGestureCoordinator {
  readonly begin: (input: ResizeGestureBeginInput) => void;
  readonly move: (event: PointerEvent) => void;
  readonly end: (event: PointerEvent) => void;
  readonly cancel: (event: PointerEvent) => void;
  readonly lostCapture: (event: PointerEvent) => void;
  readonly cancelActive: () => void;
}

const beginSingle = (
  gesture: SingleResizeGesture,
  input: ResizeGestureBeginInput,
  property: ResizePropertyKind | null,
): void => {
  if (property === null || !isSingleResizeProperty(property)) return;
  const target = createSingleResizeTarget(input.context, property);
  if (!target.ok) return;
  gesture.begin({
    handleElement: input.handleElement,
    handle: input.handle,
    event: input.event,
    target: target.target,
  });
};

export function createResizeGestureCoordinator(
  options: ResizeGestureCoordinatorOptions,
): ResizeGestureCoordinator {
  let pairHandle: ResizeHandlePosition | null = null;
  const single = createSingleResizeGesture({
    previewEngine: options.previewEngine,
    onCommit: options.onCommit,
  });
  const pair: FlexPairResizeStrategy = createFlexPairResizeStrategy({
    previewEngine: options.previewEngine,
    onCommit: (operation) => {
      pairHandle = null;
      options.onCommit(operation);
    },
    onDiagnostic: (diagnostic) =>
      options.onDiagnostic(
        {
          kind: "flex-pair-rejected",
          reason: diagnostic.code,
          message: diagnostic.message,
        },
        pairHandle,
      ),
  });

  const begin = (input: ResizeGestureBeginInput): void => {
    const route = prepareFlexPairResize(input.context, input.handle);
    switch (route.kind) {
      case "not-flex":
        beginSingle(single, input, input.selectedProperty);
        return;
      case "cross-axis":
        beginSingle(single, input, route.property);
        return;
      case "corner-disabled":
        options.onDiagnostic(
          {
            kind: "flex-pair-disabled",
            reason: "corner-handle",
            message: "corner handles are disabled for contextual flex pair resize",
          },
          input.handle,
        );
        return;
      case "rejected":
        options.onDiagnostic(
          {
            kind: "flex-pair-rejected",
            reason: route.diagnostic.code,
            message: route.diagnostic.message,
          },
          input.handle,
        );
        return;
      case "pair":
        pairHandle = input.handle;
        pair.begin({
          prepared: route.prepared,
          handleElement: input.handleElement,
          event: input.event,
        });
    }
  };

  const move = (event: PointerEvent): void => {
    single.move(event);
    pair.move(event);
  };
  const end = (event: PointerEvent): void => {
    single.end(event);
    pair.end(event);
  };
  const cancel = (event: PointerEvent): void => {
    single.cancel(event);
    pair.cancel(event);
    pairHandle = null;
  };
  const lostCapture = (event: PointerEvent): void => {
    single.lostCapture(event);
    pair.lostCapture(event);
    pairHandle = null;
  };
  const cancelActive = (): void => {
    single.cancelActive();
    pair.cancelActive();
    pairHandle = null;
  };

  return { begin, move, end, cancel, lostCapture, cancelActive };
}
