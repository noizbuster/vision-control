import type {
  DurableElementRef,
  FlexRectWitness,
  ResizeFlexPairOperation,
} from "@vision-control/change-ir";

import type { VerificationDomAdapter } from "./dom-adapter.js";
import { resolveDurableElement } from "./durable-target-resolver.js";
import type { ResolvedTarget } from "./types.js";

export interface ResolvedFlexPair {
  readonly container: Element;
  readonly primary: Element;
  readonly neighbor: Element;
  readonly witnesses: readonly {
    readonly element: Element;
    readonly expected: FlexRectWitness;
  }[];
}

export type FlexPairResolution =
  | { readonly kind: "resolved"; readonly pair: ResolvedFlexPair }
  | { readonly kind: "failed"; readonly message: string };

type NamedResolution =
  | { readonly kind: "resolved"; readonly element: Element }
  | { readonly kind: "failed"; readonly message: string };

function resolveNamed(
  dom: VerificationDomAdapter,
  label: string,
  identity: DurableElementRef,
): NamedResolution {
  const result = resolveDurableElement(dom, identity);
  return result.kind === "resolved"
    ? result
    : { kind: "failed", message: `${label}: ${result.reason}: ${result.message}` };
}

export function resolveFlexPair(
  target: ResolvedTarget,
  operation: ResizeFlexPairOperation,
): FlexPairResolution {
  const container = resolveNamed(target.dom, "container", operation.container);
  if (container.kind === "failed") return container;
  const primary = resolveNamed(target.dom, "primary", operation.members[0].element);
  if (primary.kind === "failed") return primary;
  const neighbor = resolveNamed(target.dom, "neighbor", operation.members[1].element);
  if (neighbor.kind === "failed") return neighbor;

  const witnesses: { readonly element: Element; readonly expected: FlexRectWitness }[] = [];
  for (const [index, witness] of operation.witnesses.entries()) {
    const resolved = resolveNamed(target.dom, `witness[${index}]`, witness.element);
    if (resolved.kind === "failed") return resolved;
    witnesses.push({ element: resolved.element, expected: witness });
  }

  if (target.element !== primary.element) {
    return {
      kind: "failed",
      message: "runner target is not the occurrence-selected primary member",
    };
  }

  return {
    kind: "resolved",
    pair: {
      container: container.element,
      primary: primary.element,
      neighbor: neighbor.element,
      witnesses,
    },
  };
}
