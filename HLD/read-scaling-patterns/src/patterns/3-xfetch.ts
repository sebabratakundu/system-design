import { IRedisClient } from '../db/redisClient.js';

export interface CacheEntry<T> {
  value: T;
  delta: number;   // Time spent computing value in milliseconds
  ttl: number;     // Absolute expiration timestamp in epoch milliseconds
}

/**
 * PATTERN 3: Probabilistic Early Refresh (XFetch Algorithm)
 * 
 * Prevents Cache Stampedes (Thundering Herd) near TTL expiration.
 * Formula: -beta * delta * ln(random()) > (ttl - now)
 */
export class XFetchCache {
  public backgroundRefreshes = 0;
  public totalHits = 0;
  public totalMisses = 0;

  constructor(private redis: IRedisClient) {}

  async get<T>(
    key: string,
    ttlSeconds: number,
    beta: number = 1.0,
    fetchFn: () => Promise<T>
  ): Promise<{ value: T; refreshedEarly: boolean }> {
    const raw = await this.redis.get(key);
    const now = Date.now();

    if (raw) {
      this.totalHits++;
      const entry: CacheEntry<T> = JSON.parse(raw);
      const remainingTtlMs = entry.ttl - now;

      // XFetch Formula Evaluation
      const randomVal = Math.random(); // Uniform (0, 1)
      const xFetchThreshold = -beta * entry.delta * Math.log(randomVal);

      if (xFetchThreshold < remainingTtlMs) {
        // Normal Cache Hit: Serve cached value immediately
        return { value: entry.value, refreshedEarly: false };
      }

      // XFetch Early Trigger: Asynchronously refresh in background
      this.backgroundRefreshes++;
      this.recomputeAndCache(key, ttlSeconds, fetchFn).catch((err) =>
        console.error(`[XFetch Background Error] ${err.message}`)
      );

      // Return current cached value without blocking user
      return { value: entry.value, refreshedEarly: true };
    }

    // Cache Miss: Compute synchronously
    this.totalMisses++;
    const value = await this.recomputeAndCache(key, ttlSeconds, fetchFn);
    return { value, refreshedEarly: false };
  }

  private async recomputeAndCache<T>(
    key: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    const value = await fetchFn();
    const delta = Math.max(1, Date.now() - start);
    const ttl = Date.now() + ttlSeconds * 1000;

    const entry: CacheEntry<T> = { value, delta, ttl };
    await this.redis.setex(key, ttlSeconds, JSON.stringify(entry));
    return value;
  }
}
