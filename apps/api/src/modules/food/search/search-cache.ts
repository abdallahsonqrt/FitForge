import { Injectable } from '@nestjs/common';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-process TTL cache with LRU eviction.
 *
 * Sits in front of the search path so a term typed repeatedly — which is most of
 * them, autocomplete fires on every keystroke — costs nothing after the first
 * hit. Deliberately per-instance: entries are cheap to recompute and a shared
 * Redis would add a network hop to the very path this exists to keep fast.
 * Swapping in a distributed cache later means reimplementing this interface, not
 * touching the services.
 */
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 1000;

@Injectable()
export class SearchCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return null;
    }

    // Re-insert to mark as recently used — Map preserves insertion order, which
    // is what makes the eviction below LRU rather than FIFO.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): void {
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Drop every entry whose key starts with `prefix` — the `search:`, `suggest:`
   * and `custom:` families written above.
   *
   * Note that per-user state is deliberately *not* cached: favourite flags and
   * relevance scores are applied after a cache hit, so starring a food needs no
   * invalidation here.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
