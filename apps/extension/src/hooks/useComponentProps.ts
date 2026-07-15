import type { SelectionSummary } from "@vision-control/inspector-core";
import type { ComponentPropEntry, MessageBus } from "../messaging/index.js";

/**
 * Component-props AST product path is dropped (ADR-019 C7). Always empty;
 * PropsPanel stays mounted only when props length > 0, so it never appears.
 */
export function useComponentProps(
  _bus: MessageBus | undefined,
  _selection: SelectionSummary | null,
): { readonly componentProps: readonly ComponentPropEntry[] } {
  return { componentProps: [] };
}
