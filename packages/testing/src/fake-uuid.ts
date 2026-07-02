/**
 * Deterministic, injectable UUID generator. Returns stable, zero-padded
 * sequential ids (`uuid-0001`, `uuid-0002`, ...) so test snapshots and
 * recorded changesets are reproducible.
 *
 * Standalone (does not wrap `vi.mock`) so it can be threaded through code
 * that allocates ids via a `() => string` indirection.
 */
export class FakeUuidSequencer {
  private counter: number;
  private readonly prefix: string;
  private readonly start: number;

  constructor(prefix: string = "uuid-", start: number = 1) {
    this.prefix = prefix;
    this.start = start;
    this.counter = start;
  }

  /** Allocate and return the next id. */
  next(): string {
    const id = `${this.prefix}${this.counter.toString().padStart(4, "0")}`;
    this.counter += 1;
    return id;
  }

  /** Reset the sequence to its starting value (or a new one if given). */
  reset(start?: number): void {
    this.counter = start ?? this.start;
  }
}
