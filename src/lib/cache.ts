import { getEnv } from './env';

/**
 * Small cache abstraction used by the leaderboard service and the rate limiter.
 *
 * The default driver is an in-process map, which is correct for a single-node
 * deployment. Setting REDIS_URL swaps in a Redis driver so several app nodes
 * can share the cache and the rate-limit counters without touching callers.
 */
export interface CacheDriver {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
  /** Atomically increments a counter and returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

type MemoryEntry = { value: unknown; expiresAt: number | null };

class MemoryCacheDriver implements CacheDriver {
  private store = new Map<string, MemoryEntry>();

  private alive(key: string): MemoryEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.alive(key);
    return entry ? (entry.value as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.alive(key);
    const next = ((entry?.value as number) ?? 0) + 1;
    this.store.set(key, {
      value: next,
      expiresAt: entry?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return next;
  }
}

class RedisCacheDriver implements CacheDriver {
  // Typed loosely so ioredis stays an optional runtime dependency.
  constructor(private client: any) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) await this.client.set(key, raw, 'EX', ttlSeconds);
    else await this.client.set(key, raw);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    const stream = this.client.scanStream({ match: `${prefix}*`, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.client.del(...keys);
    }
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const value = await this.client.incr(key);
    if (value === 1) await this.client.expire(key, ttlSeconds);
    return value;
  }
}

const globalForCache = globalThis as unknown as { __clashArenaCache?: CacheDriver };

export function getCache(): CacheDriver {
  if (globalForCache.__clashArenaCache) return globalForCache.__clashArenaCache;

  const { REDIS_URL } = getEnv();
  let driver: CacheDriver = new MemoryCacheDriver();

  if (REDIS_URL) {
    try {
      // Required lazily so the app runs with zero Redis infrastructure.
      const Redis = require('ioredis');
      const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
      client.on('error', (err: Error) => {
        console.error('[cache] redis error:', err.message);
      });
      driver = new RedisCacheDriver(client);
      console.log('[cache] using redis driver');
    } catch (error) {
      console.warn('[cache] redis unavailable, falling back to in-process cache:', error);
    }
  }

  globalForCache.__clashArenaCache = driver;
  return driver;
}

export const cacheKeys = {
  leaderboard: (tournamentId: string) => `lb:${tournamentId}`,
  leaderboardPrefix: (tournamentId: string) => `lb:${tournamentId}`,
  tournamentState: (tournamentId: string) => `ts:${tournamentId}`,
  rateLimit: (bucket: string, identity: string) => `rl:${bucket}:${identity}`,
};
