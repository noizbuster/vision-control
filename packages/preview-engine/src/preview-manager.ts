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

import { applyClassPreview } from "./adapters/class-adapter.js";
import type { RollbackFn } from "./adapters/preview-adapter.js";
import { applyStructuralPreview } from "./adapters/structural-adapter.js";
import { applyResizePreview, applyStylePreview } from "./adapters/style-adapter.js";
import { applyTextPreview } from "./adapters/text-adapter.js";
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
import type { StylesheetManager } from "./stylesheet-manager.js";
import { createStylesheetManager } from "./stylesheet-manager.js";

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

  const dispatchStructural = (
    op: Extract<Operation, { kind: "reorder-child" | "reparent-element" }>,
  ): DispatchResult => {
    const innerRollback = applyStructuralPreview(dom, op);
    const targetId = op.kind === "reparent-element" ? op.element.runtimeId : op.child.runtimeId;
    const element = dom.resolveElement(targetId);

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

  const dispatch = (operation: Operation): DispatchResult => {
    switch (operation.kind) {
      case "style-edit":
        return dispatchStyleEdit(operation);
      case "resize-element":
        return {
          rollback: applyResizePreview(stylesheet, operation),
          observer: null,
          simulated: null,
        };
      case "class-add":
      case "class-remove":
      case "class-replace":
        return { rollback: applyClassPreview(dom, operation), observer: null, simulated: null };
      case "text-edit":
        return { rollback: applyTextPreview(dom, operation), observer: null, simulated: null };
      case "reorder-child":
      case "reparent-element":
        return dispatchStructural(operation);
      case "multi-select-group":
      case "group-reorder":
      case "group-reparent":
      case "align-elements":
      case "distribute-elements":
      case "set-container-layout":
      case "set-child-sizing":
      case "grid-reorder":
      case "grid-span":
      case "breakpoint-style-edit":
      case "breakpoint-class-edit":
      case "breakpoint-text-edit":
      case "screenshot-crop-ref":
      case "suggested-diff":
      case "remove-style":
      case "set-attribute":
      case "position-element":
      case "insert-element":
      case "remove-element":
      case "duplicate-element":
      case "wrap-elements":
      case "unwrap-element":
        // V1/structural operation kinds have schemas + inverses (change-ir) but
        // their preview rendering lands in a later wave. No UI emits them yet,
        // so this path is unreachable until then.
        throw new Error(`Preview not yet implemented for operation kind: ${operation.kind}`);
      default: {
        const _: never = operation;
        _;
        throw new Error("Unsupported operation kind");
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
