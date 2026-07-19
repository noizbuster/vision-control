export type ElementIdentity = {
  readonly runtimeId: string;
  readonly selector?: string | undefined;
  readonly occurrence?: number | undefined;
  readonly fingerprint?: string | undefined;
};

const hasDurableIdentity = (
  identity: ElementIdentity,
): identity is ElementIdentity & {
  readonly selector: string;
  readonly occurrence: number;
  readonly fingerprint: string;
} =>
  identity.selector !== undefined &&
  identity.occurrence !== undefined &&
  identity.fingerprint !== undefined;

export const sameElementIdentity = (left: ElementIdentity, right: ElementIdentity): boolean =>
  left.runtimeId === right.runtimeId ||
  (hasDurableIdentity(left) &&
    hasDurableIdentity(right) &&
    left.selector === right.selector &&
    left.occurrence === right.occurrence &&
    left.fingerprint === right.fingerprint);
