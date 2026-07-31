import { IRedisClient } from '../db/redisClient.js';

/**
 * PATTERN 4: Cache Key Fanout (Salting Hot Keys)
 * 
 * Spreads high QPS requests for a single celebrity/viral key across K salted keys
 * to prevent saturating a single Redis cluster node's CPU/NIC.
 */
export class KeyFanoutCache {
  constructor(private redis: IRedisClient, private numShards: number = 10) {}

  /**
   * Writes the hot payload across all K salted keys using a Redis pipeline
   */
  async setHotKey(baseKey: string, data: any, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    const payload = JSON.stringify(data);

    for (let i = 0; i < this.numShards; i++) {
      const shardKey = `${baseKey}:shard_${i}`;
      pipeline.setex(shardKey, ttlSeconds, payload);
    }

    await pipeline.exec();
  }

  /**
   * Reads from a randomly selected salted key shard
   */
  async getHotKey(baseKey: string): Promise<{ data: any; shardUsed: string } | null> {
    const randomShardId = Math.floor(Math.random() * this.numShards);
    const shardKey = `${baseKey}:shard_${randomShardId}`;

    const raw = await this.redis.get(shardKey);
    if (!raw) return null;

    return {
      data: JSON.parse(raw),
      shardUsed: shardKey
    };
  }
}
