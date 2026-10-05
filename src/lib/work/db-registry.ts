// The thin database-backed Work Registry.
//
// It adds NO rules. It loads the whole registry state from the store into the already-tested
// InMemoryWorkRegistry, runs the exact contract operation, and persists the result. Every operation —
// create, read, lifecycle transitions, ownership, source events, deduplication, approvals, incidents,
// repository locks, audit history — is the in-memory registry's own method, now backed by durable
// storage. The canonical short ref (`W-####`) is the database's generated column: a ref returned from a
// create before the next load is provisional; after a reload it is the database's. Server-side only.
//
// This is a FOUNDATION, not a live, concurrent service. Each mutate loads and persists the whole state,
// which is correct and simple while nothing operational writes concurrently. Per-operation transactions
// and row-level locking are the documented next step, before any live writer is connected.

import { InMemoryWorkRegistry, type RegistryOptions } from './registry';
import { WorkConflictError, type WorkStore } from './db-store';
import type { Result } from './types';

export interface DbRegistryOptions extends Omit<RegistryOptions, 'seed'> {}

/** Load the durable state into a fresh in-memory registry (the tested contract, backed by the store). */
export async function loadRegistry(store: WorkStore, opts: DbRegistryOptions = {}): Promise<InMemoryWorkRegistry> {
  const seed = await store.loadAll();
  return new InMemoryWorkRegistry({ ...opts, seed });
}

export const MAX_WRITE_ATTEMPTS = 3;

const baseOf = (reg: InMemoryWorkRegistry): Map<string, number> => new Map(reg.snapshot().items.map((i) => [i.id, i.events.length]));

/**
 * Load, run one operation, persist only what changed. If another writer got there first the store refuses the
 * stale write (nothing of it lands), and the whole operation is re-run on fresh state, at most MAX_WRITE_ATTEMPTS
 * times; then the conflict is thrown. The operation must be a pure function of the registry it is given.
 */
export async function mutateRegistry<T>(
  store: WorkStore,
  op: (reg: InMemoryWorkRegistry) => { value: T; changed: boolean },
  opts: DbRegistryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const reg = await loadRegistry(store, opts);
    const base = baseOf(reg);
    const out = op(reg);
    if (!out.changed) return out.value;
    try {
      await store.persist(reg.snapshot(), { base });
      return out.value;
    } catch (e) {
      if (!(e instanceof WorkConflictError) || attempt >= MAX_WRITE_ATTEMPTS) throw e;
    }
  }
}

/** Load, run one operation with the pure contract, persist the result. Returns the operation's own Result. */
export async function withRegistry<T>(store: WorkStore, op: (reg: InMemoryWorkRegistry) => Result<T>, opts: DbRegistryOptions = {}): Promise<Result<T>> {
  return mutateRegistry(store, (reg) => { const r = op(reg); return { value: r, changed: r.ok }; }, opts);
}

/**
 * Ergonomic wrapper: the same contract surface, each mutation backed by load→op→persist. Read methods
 * load a fresh view. Intended for the foundation and for tests, not yet for concurrent live writers.
 */
export class DbWorkRegistry {
  constructor(private readonly store: WorkStore, private readonly opts: DbRegistryOptions = {}) {}

  /** Run a read against a freshly loaded registry. */
  read<T>(fn: (reg: InMemoryWorkRegistry) => T): Promise<T> {
    return loadRegistry(this.store, this.opts).then(fn);
  }

  /** Run a mutation that returns a Result; persists only on success. */
  mutate<T>(op: (reg: InMemoryWorkRegistry) => Result<T>): Promise<Result<T>> {
    return withRegistry(this.store, op, this.opts);
  }
}
