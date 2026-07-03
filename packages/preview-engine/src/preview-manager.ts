/**
 * PreviewManager: the central orchestrator.
 *
 * Owns the stylesheet manager, dispatches operations to adapters, attaches
 * reconciliation observers for structural operations, manages simulated ghost
 * previews, and provides `clearAll()` — the critical reset used by the
 * verification engine before asserting source-patched state.
 *
 * Preview is NOT source truth: every mutation is reversible. The journal
 * records intent; the preview engine renders the visual effect.
 */

import type { Operation } from "@vision-control/change-ir";

import {
  applyBreakpointClassEditPreview,
  applyClassPreview,
  applySetAttributePreview,
} from "./adapters/class-adapter.js";
import {
  noopRollback,
  type RollbackFn,
  UnsupportedPreviewOperationError,
} from "./adapters/preview-adapter.js";
import { applyStructuralPreview, type StructuralOperation } from "./adapters/structural-adapter.js";
import {
  applyPositionElementPreview,
  applyRemoveStylePreview,
  applyStylePreview,
} from "./adapters/style-adapter.js";
import { applyBreakpointTextEditPreview, applyTextPreview } from "./adapters/text-adapter.js";
import { applyTransformPreview } from "./adapters/transform-adapter.js";
import { detectSpecificityConflict, type SpecificityConflictDiagnostic } from "./diagnostics.js";
import type { PreviewDomAdapter } from "./dom-adapter.js";
import { createPreviewTransaction, type PreviewTransaction } from "./preview-transaction.js";
import {
  createReconciliationObserver,
  type ReconciliationObserver,
} from "./reconciliation-observer.js";
import {
  createSimulatedPreview,
  type GhostRenderer,
  type SimulatedPreview,
} from "./simulated-preview.js";
import {
  applyCssRule,
  createStylesheetManager,
  type StylesheetManager,
} from "./stylesheet-manager.js";

interface TrackedEntry {
  readonly rollback: RollbackFn;
  readonly observer: ReconciliationObserver | null;
  readonly simulated: SimulatedPreview | null;
}

interface DispatchResult {
  readonly rollback: RollbackFn;
  readonly observer: ReconciliationObserver | null;
  readonly simulated: SimulatedPreview | null;
}

export interface PreviewManagerOptions {
  readonly dom: PreviewDomAdapter;
  readonly ghostRenderer?: GhostRenderer;
}

export interface PreviewManager {
  readonly stylesheet: StylesheetManager;
  readonly diagnostics: readonly SpecificityConflictDiagnostic[];
  readonly hasSimulatedPreviews: boolean;
  readonly activeCount: number;
  beginTransaction: () => PreviewTransaction;
  applyOperation: (operation: Operation) => RollbackFn;
  applyTransform: (runtimeId: string, translateX: number, translateY: number) => RollbackFn;
  clearAll: () => void;
}

export function createPreviewManager(options: PreviewManagerOptions): PreviewManager {
  const { dom } = options;
  const ghostRenderer: GhostRenderer | null = options.ghostRenderer ?? null;
  const stylesheet = createStylesheetManager(dom);
  const entries: TrackedEntry[] = [];
  const diagnosticsList: SpecificityConflictDiagnostic[] = [];

  const removeEntry = (entry: TrackedEntry): void => {
    const idx = entries.indexOf(entry);
    if (idx >= 0) entries.splice(idx, 1);
  };

  const dispatchStyleEdit = (op: Extract<Operation, { kind: "style-edit" }>): DispatchResult => {
    const innerRollback = applyStylePreview(stylesheet, op);
    let diagnostic: SpecificityConflictDiagnostic | null = null;

    const element = dom.resolveElement(op.target.runtimeId);
    if (element !== null) {
      diagnostic = detectSpecificityConflict(
        dom,
        op.target.runtimeId,
        element,
        op.property,
        op.value,
      );
      if (diagnostic !== null) diagnosticsList.push(diagnostic);
    }

    const rollback: RollbackFn = (): void => {
      innerRollback();
      if (diagnostic !== null) {
        const idx = diagnosticsList.indexOf(diagnostic);
        if (idx >= 0) diagnosticsList.splice(idx, 1);
      }
    };

    return { rollback, observer: null, simulated: null };
  };

  const structuralObserverTargetId = (op: StructuralOperation): string | null => {
    switch (op.kind) {
      case "reorder-child":
        return op.child.runtimeId;
      case "reparent-element":
        return op.element.runtimeId;
      case "grid-reorder":
        return op.placement === "dom-order" ? op.child.runtimeId : null;
      case "group-reorder":
        return op.children[0]?.runtimeId ?? null;
      case "group-reparent":
        return op.elements[0]?.runtimeId ?? null;
      default:
        return null;
    }
  };

  const dispatchStructural = (op: StructuralOperation): DispatchResult => {
    const innerRollback = applyStructuralPreview(dom, op);
    const targetId = structuralObserverTargetId(op);
    const element = targetId !== null ? dom.resolveElement(targetId) : null;

    let observer: ReconciliationObserver | null = null;
    let simulated: SimulatedPreview | null = null;

    if (element !== null && ghostRenderer !== null) {
      simulated = createSimulatedPreview(op, ghostRenderer);
      observer = createReconciliationObserver({
        dom,
        target: element,
        onRevert: (): void => {
          if (simulated !== null && !simulated.isActive()) {
            simulated.activate(dom.getRect(element));
          }
        },
      });
      observer.start();
    }

    const rollback: RollbackFn = (): void => {
      observer?.stop();
      simulated?.deactivate();
      innerRollback();
    };

    return { rollback, observer, simulated };
  };

  const noopDispatch = (): DispatchResult => ({
    rollback: noopRollback,
    observer: null,
    simulated: null,
  });

  const cssDispatch = (runtimeId: string, declarations: string): DispatchResult => ({
    rollback: applyCssRule(stylesheet, runtimeId, declarations),
    observer: null,
    simulated: null,
  });

  // allow: SIZE_OK — exhaustive Operation.kind dispatch over a 30-variant
  // discriminated union. Splitting the switch would break the compile-time
  // exhaustiveness guarantee (the `never` default branch) that makes a missing
  // kind a type error. Mirrors the changeset.ts computeInverse precedent.
  const dispatch = (operation: Operation): DispatchResult => {
    switch (operation.kind) {
      case "style-edit":
        return dispatchStyleEdit(operation);
      case "resize-element":
        return cssDispatch(
          operation.element.runtimeId,
          `${operation.property}: ${operation.toValue}${operation.unit};`,
        );
      case "class-add":
      case "class-remove":
      case "class-replace":
        return { rollback: applyClassPreview(dom, operation), observer: null, simulated: null };
      case "text-edit":
        return { rollback: applyTextPreview(dom, operation), observer: null, simulated: null };
      case "remove-style":
        return {
          rollback: applyRemoveStylePreview(stylesheet, operation),
          observer: null,
          simulated: null,
        };
      case "position-element":
        return {
          rollback: applyPositionElementPreview(stylesheet, operation),
          observer: null,
          simulated: null,
        };
      case "set-attribute":
        return {
          rollback: applySetAttributePreview(dom, operation),
          observer: null,
          simulated: null,
        };
      case "breakpoint-style-edit":
        return cssDispatch(
          operation.target.runtimeId,
          `${operation.property}: ${operation.value}${operation.important ? " !important" : ""};`,
        );
      case "breakpoint-class-edit":
        return {
          rollback: applyBreakpointClassEditPreview(dom, operation),
          observer: null,
          simulated: null,
        };
      case "breakpoint-text-edit":
        return {
          rollback: applyBreakpointTextEditPreview(dom, operation),
          observer: null,
          simulated: null,
        };
      case "set-container-layout":
        return cssDispatch(
          operation.container.runtimeId,
          `${operation.property}: ${operation.value};`,
        );
      case "set-child-sizing":
        return operation.value !== undefined
          ? cssDispatch(operation.child.runtimeId, `${operation.value};`)
          : noopDispatch();
      case "grid-span":
        return cssDispatch(
          operation.child.runtimeId,
          `grid-${operation.axis}: span ${operation.toSpan};`,
        );
      case "grid-reorder":
        if (operation.placement === "grid-area" && operation.newGridArea !== undefined) {
          return cssDispatch(operation.child.runtimeId, `grid-area: ${operation.newGridArea};`);
        }
        return dispatchStructural(operation);
      case "reorder-child":
      case "reparent-element":
      case "group-reorder":
      case "group-reparent":
      case "insert-element":
      case "remove-element":
      case "duplicate-element":
      case "wrap-elements":
      case "unwrap-element":
        return dispatchStructural(operation);
      // Metadata-only or content-side-resolved kinds: no DOM mutation here.
      // screenshot-crop-ref / suggested-diff are inert artifacts; multi-select-group
      // records a selection; align/distribute carry geometry the content-side layer
      // resolves before applying (Task 20). All remain tracked so clearAll resets them.
      case "align-elements":
      case "distribute-elements":
      case "multi-select-group":
      case "screenshot-crop-ref":
      case "suggested-diff":
      // set-component-prop is a source-only edit (PRD §7.2): no DOM mutation here.
      case "set-component-prop":
        return noopDispatch();
      default: {
        const exhaustive: never = operation;
        throw new UnsupportedPreviewOperationError(
          (exhaustive as { kind?: string }).kind ?? "unknown",
        );
      }
    }
  };

  const trackEntry = (result: DispatchResult): TrackedEntry => {
    const entry: TrackedEntry = {
      rollback: result.rollback,
      observer: result.observer,
      simulated: result.simulated,
    };
    entries.push(entry);
    return entry;
  };

  const applyOperation = (operation: Operation): RollbackFn => {
    const result = dispatch(operation);
    const entry = trackEntry(result);
    return (): void => {
      result.rollback();
      removeEntry(entry);
    };
  };

  const applyTransform = (
    runtimeId: string,
    translateX: number,
    translateY: number,
  ): RollbackFn => {
    return applyTransformPreview(stylesheet, { runtimeId, translateX, translateY });
  };

  const clearAll = (): void => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry === undefined) continue;
      entry.observer?.stop();
      entry.simulated?.deactivate();
      entry.rollback();
    }
    entries.length = 0;
    stylesheet.clear();
    diagnosticsList.length = 0;
  };

  const beginTransaction = (): PreviewTransaction => {
    return createPreviewTransaction(crypto.randomUUID(), {
      dispatch: (operation: Operation): RollbackFn => {
        const result = dispatch(operation);
        const entry = trackEntry(result);
        return (): void => {
          result.rollback();
          removeEntry(entry);
        };
      },
    });
  };

  return {
    stylesheet,
    get diagnostics() {
      return diagnosticsList;
    },
    get hasSimulatedPreviews() {
      return entries.some((e) => e.simulated?.isActive() === true);
    },
    get activeCount() {
      return entries.length;
    },
    beginTransaction,
    applyOperation,
    applyTransform,
    clearAll,
  };
}
