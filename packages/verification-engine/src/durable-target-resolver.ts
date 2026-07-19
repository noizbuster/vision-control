import type { VerificationDomAdapter } from "./dom-adapter.js";

export interface DurableIdentity {
  readonly selector: string;
  readonly occurrence: number;
  readonly fingerprint: string;
  readonly sourceId?: string | undefined;
}

export type DurableResolution =
  | { readonly kind: "resolved"; readonly element: Element }
  | {
      readonly kind: "failed";
      readonly reason:
        | "invalid-occurrence"
        | "selector-empty"
        | "occurrence-out-of-range"
        | "ambiguous-candidate"
        | "fingerprint-mismatch"
        | "source-id-mismatch";
      readonly message: string;
    };

export function resolveDurableElement(
  dom: VerificationDomAdapter,
  identity: DurableIdentity,
): DurableResolution {
  if (!Number.isInteger(identity.occurrence) || identity.occurrence < 0) {
    return {
      kind: "failed",
      reason: "invalid-occurrence",
      message: `occurrence ${identity.occurrence} is not a non-negative integer`,
    };
  }

  const matches = dom.querySelectorAll(identity.selector);
  if (matches.length === 0) {
    return {
      kind: "failed",
      reason: "selector-empty",
      message: `selector ${JSON.stringify(identity.selector)} matched zero elements`,
    };
  }

  const element = matches[identity.occurrence];
  if (element === undefined) {
    return {
      kind: "failed",
      reason: "occurrence-out-of-range",
      message: `occurrence ${identity.occurrence} is outside ${matches.length} selector match(es)`,
    };
  }

  if (matches.filter((candidate) => candidate === element).length !== 1) {
    return {
      kind: "failed",
      reason: "ambiguous-candidate",
      message: `occurrence ${identity.occurrence} did not identify one unique selector match`,
    };
  }

  const fingerprint = dom.computeFingerprint(element);
  if (fingerprint !== identity.fingerprint) {
    return {
      kind: "failed",
      reason: "fingerprint-mismatch",
      message: `fingerprint expected ${identity.fingerprint} but got ${fingerprint}`,
    };
  }

  if (
    identity.sourceId !== undefined &&
    dom.getAttribute(element, "data-vc-source") !== identity.sourceId
  ) {
    return {
      kind: "failed",
      reason: "source-id-mismatch",
      message: `source id expected ${identity.sourceId} on the occurrence-selected element`,
    };
  }

  return { kind: "resolved", element };
}
