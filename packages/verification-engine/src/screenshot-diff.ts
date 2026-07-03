/**
 * Optional screenshot similarity diff assertion (VC-V1V2-15).
 *
 * The verification engine may compare two redacted crops (e.g. before and after
 * a source patch lands) to assert the visual result. The V1 metric is:
 *
 *   - identical content hash  -> similarity 1.0 (authoritative, short-circuit);
 *   - otherwise               -> a dependency-free byte-similarity ratio
 *                                (matching bytes / max length).
 *
 * A perceptual/image-hash diff is deliberately out of scope for V1: it would
 * pull in an image codec dependency and is not needed to answer "did the patch
 * change the rendered crop". The byte ratio is deterministic and honest about
 * its limits (documented in the result message).
 */

/** One crop's data fed into the diff. */
export interface ScreenshotCropData {
  readonly bytes: Uint8Array;
  readonly contentHash: string;
}

/** Options for the diff assertion. */
export interface ScreenshotDiffOptions {
  /** Similarity threshold in [0, 1]; default {@link DEFAULT_DIFF_THRESHOLD}. */
  readonly threshold?: number;
}

/** Verdict + metadata returned by {@link assertScreenshotSimilarity}. */
export interface ScreenshotDiffResult {
  readonly verdict: "pass" | "fail";
  /** Similarity ratio in [0, 1] (1.0 when the content hashes match). */
  readonly similarity: number;
  readonly threshold: number;
  /** True when the two content hashes are equal. */
  readonly identicalHash: boolean;
  readonly message: string;
}

/** Default similarity threshold: crops must be >= 95% byte-identical to pass. */
export const DEFAULT_DIFF_THRESHOLD = 0.95;

/**
 * Dependency-free byte similarity: matching byte count divided by the longer
 * array's length. Returns 1 for two empty arrays.
 */
export function byteSimilarity(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 && b.length === 0) return 1;
  const max = Math.max(a.length, b.length);
  const min = Math.min(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < min; i += 1) {
    const av = a[i];
    const bv = b[i];
    if (av !== undefined && bv !== undefined && av === bv) matches += 1;
  }
  return matches / max;
}

/**
 * Assert that two crops are similar enough. Passes when the similarity ratio is
 * at or above the threshold. The content hash is authoritative: matching hashes
 * always yield similarity 1.0 regardless of byte-array differences.
 */
export function assertScreenshotSimilarity(
  before: ScreenshotCropData,
  after: ScreenshotCropData,
  options?: ScreenshotDiffOptions,
): ScreenshotDiffResult {
  const threshold = options?.threshold ?? DEFAULT_DIFF_THRESHOLD;
  const identicalHash = before.contentHash === after.contentHash;
  const similarity = identicalHash ? 1 : byteSimilarity(before.bytes, after.bytes);
  const verdict: "pass" | "fail" = similarity >= threshold ? "pass" : "fail";
  const message = identicalHash
    ? "Identical content hash — crops match exactly."
    : verdict === "pass"
      ? `Similarity ${similarity.toFixed(4)} >= threshold ${threshold}.`
      : `Similarity ${similarity.toFixed(4)} < threshold ${threshold}; crops differ.`;
  return { verdict, similarity, threshold, identicalHash, message };
}
