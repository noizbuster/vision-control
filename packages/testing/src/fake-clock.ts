/**
 * Deterministic, injectable clock. Standalone (does not wrap
 * `vi.useFakeTimers`) so it can be constructed in any context and threaded
 * through code that reads time via a `() => number` indirection.
 *
 * The numeric scale (epoch ms vs. monotonic ms) is owned by the caller; the
 * clock just stores and advances whatever numbers it is given, matching the
 * surface of `Date.now()` / `Performance.now()` (`now(): number`).
 */
export class FakeClock {
  private current: number;
  private readonly initial: number;

  constructor(initial: number = 0) {
    this.initial = initial;
    this.current = initial;
  }

  /** Current time value (whatever scale the caller chose). */
  now(): number {
    return this.current;
  }

  /** Advance time by `ms` and return the new `now()`. */
  tick(ms: number): number {
    this.current += ms;
    return this.current;
  }

  /** Set the absolute time value. */
  setNow(value: number): void {
    this.current = value;
  }

  /** Reset to the constructor's initial value (or a new one if given). */
  reset(initial?: number): void {
    this.current = initial ?? this.initial;
  }
}
