/**
 * Screenshot diff assertion fixtures (VC-V1V2-15).
 *
 * Deterministic before/after crop byte arrays used by the visual-regression-lab
 * diff tests. These stand in for redacted screenshot crops captured before and
 * after a source patch; the bytes are arbitrary but stable so the similarity
 * ratio is reproducible. No image codec is involved (V1 diff is hash + byte
 * ratio; perceptual diff is a future enhancement).
 */

export interface DiffFixture {
  readonly bytes: Uint8Array;
  readonly contentHash: string;
}

/** A "before" crop: 8 bytes representing the pre-patch render. */
export const BEFORE_CROP: DiffFixture = {
  bytes: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
  contentHash: "sha256:before-8b",
};

/** An "after" crop identical to the before crop (patch produced no visual change). */
export const AFTER_IDENTICAL: DiffFixture = {
  bytes: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
  contentHash: "sha256:before-8b",
};

/** An "after" crop differing in one byte (7/8 = 0.875 similarity). */
export const AFTER_NEAR_MATCH: DiffFixture = {
  bytes: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 99]),
  contentHash: "sha256:after-near",
};

/** An "after" crop differing in every byte (0 similarity). */
export const AFTER_TOTAL_CHANGE: DiffFixture = {
  bytes: new Uint8Array([99, 98, 97, 96, 95, 94, 93, 92]),
  contentHash: "sha256:after-total",
};

/** A cropped-region label for diagnostic output. */
export const FIXTURE_REGION_LABEL = "login-card";
