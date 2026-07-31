import { IRedisClient } from '../db/redisClient.js';
import { db } from '../db/database.js';

/**
 * PATTERN 7: Stage 3 — Application Look-Aside Caching & CDN Edge Headers
 * 
 * Demonstrates:
 *  1. Look-Aside Cache-Aside pattern with Redis.
 *  2. CDN Cache-Control Header generation (`stale-while-revalidate`).
 */

export class AppCacheAside {
  public cacheHits = 0;
  public cacheMisses = 0;

  constructor(private redis: IRedisClient) {}

  async getUserFeed(uuid: string): Promise<{ data: any; source: string; latencyMs: number }> {
    const cacheKey = `user:feed:${uuid}`;
    const start = process.hrtime.bigint();

    // 1. Check Redis Cache (<1ms RAM lookup)
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      const end = process.hrtime.bigint();
      return {
        data: JSON.parse(cached),
        source: 'REDIS_CACHE_HIT',
        latencyMs: Number(end - start) / 1_000_000
      };
    }

    // 2. Cache Miss: Fetch from DB Replica (15-20ms SQL query)
    this.cacheMisses++;
    const dbUser = db.prepare('SELECT * FROM users WHERE uuid = ?').get(uuid) as any;

    // 3. Populate Redis Cache (TTL 60s)
    await this.redis.setex(cacheKey, 60, JSON.stringify(dbUser));

    const end = process.hrtime.bigint();
    return {
      data: dbUser,
      source: 'DATABASE_REPLICA_MISS',
      latencyMs: Number(end - start) / 1_000_000
    };
  }

  // Generates CDN Cache-Control Headers for Edge Locations
  getCdnHeaders(maxAgeSec: number = 60, staleRevalidateSec: number = 300) {
    return {
      'Cache-Control': `public, max-age=${maxAgeSec}, stale-while-revalidate=${staleRevalidateSec}`,
      'CDN-Cache-Status': 'HIT',
      'Vary': 'Accept-Encoding'
    };
  }
}
