import type { SourceAdapter } from "./adapter-contract.js";

/**
 * Registry of source adapters (VC-V1V2-04).
 *
 * Adapters register themselves here; the resolver consults the registry in
 * registration order. The registry starts EMPTY by default in this task — the
 * real Tailwind / CSS Modules / Next.js / Vue / Svelte / CSS-in-JS / vanilla
 * CSS adapters are populated by Wave 3+ tasks (11-14, 18-20). Until then, the
 * only registered adapters are the not-yet-implemented stubs in `v1-stubs.ts`,
 * and callers are free to register their own.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();
  private readonly order: string[] = [];

  /** Register (or replace) an adapter by its id. Returns the registered adapter. */
  register(adapter: SourceAdapter): SourceAdapter {
    if (!this.adapters.has(adapter.id)) {
      this.order.push(adapter.id);
    }
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }

  /** Remove an adapter by id. Returns whether one existed. */
  unregister(id: string): boolean {
    const existed = this.adapters.delete(id);
    if (existed) {
      const idx = this.order.indexOf(id);
      if (idx >= 0) this.order.splice(idx, 1);
    }
    return existed;
  }

  /** Whether an adapter with the given id is registered. */
  has(id: string): boolean {
    return this.adapters.has(id);
  }

  /** All registered adapters in registration order. */
  list(): readonly SourceAdapter[] {
    return this.order
      .map((id) => this.adapters.get(id))
      .filter((a): a is SourceAdapter => a !== undefined);
  }

  /** Number of registered adapters. */
  get size(): number {
    return this.adapters.size;
  }
}
