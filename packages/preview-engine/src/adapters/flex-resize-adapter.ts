import type { ResizeFlexPairOperation } from "@vision-control/change-ir";
import type { PreviewDomAdapter } from "../dom-adapter.js";
import type { StylesheetManager } from "../stylesheet-manager.js";
import { applyCssRule } from "../stylesheet-manager.js";
import type { RollbackFn } from "./preview-adapter.js";

type FlexPairMember = ResizeFlexPairOperation["members"][number];

export class FlexPairPreviewError extends Error {
  override readonly name = "FlexPairPreviewError";

  constructor(
    readonly memberRole: FlexPairMember["role"],
    readonly runtimeId: string,
    options?: ErrorOptions,
  ) {
    super(`Cannot apply ${memberRole} flex preview for unresolved element ${runtimeId}`, options);
  }
}

const declarationsFor = (member: FlexPairMember): string => {
  const { flexGrow, flexShrink, flexBasis } = member.after.flex;
  return `flex-grow: ${flexGrow}; flex-shrink: ${flexShrink}; flex-basis: ${flexBasis};`;
};

export function applyFlexPairPreview(
  stylesheet: StylesheetManager,
  dom: PreviewDomAdapter,
  operation: ResizeFlexPairOperation,
): RollbackFn {
  const rollbacks: RollbackFn[] = [];
  const rollbackApplied = (): void => {
    for (let index = rollbacks.length - 1; index >= 0; index -= 1) {
      rollbacks[index]?.();
    }
  };

  for (const member of operation.members) {
    try {
      if (dom.resolveElement(member.element.runtimeId) === null) {
        throw new FlexPairPreviewError(member.role, member.element.runtimeId);
      }
      rollbacks.push(applyCssRule(stylesheet, member.element.runtimeId, declarationsFor(member)));
    } catch (error) {
      rollbackApplied();
      if (error instanceof FlexPairPreviewError) throw error;
      throw new FlexPairPreviewError(member.role, member.element.runtimeId, { cause: error });
    }
  }

  return rollbackApplied;
}
