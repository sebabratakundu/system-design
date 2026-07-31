import { IRedisClient } from '../db/redisClient.js';
import { queryUserByUuid, updateUserBioAndVersion } from '../db/database.js';

/**
 * PATTERN 2: Atomic Cache Key Versioning
 * 
 * Eliminates cache invalidation race conditions without explicit key deletions.
 * Key structure:
 *   - Version pointer key: `user:{uuid}:version`
 *   - Versioned data key: `user:{uuid}:v{version}`
 */
export class VersionedCache {
  constructor(private redis: IRedisClient) {}

  async getUser(uuid: string): Promise<any> {
    // 1. Fetch current version pointer
    const versionKey = `user:${uuid}:version`;
    let versionStr = await this.redis.get(versionKey);

    if (!versionStr) {
      // Version miss: Fetch current row version from SQLite
      const dbRow = queryUserByUuid(uuid) as any;
      if (!dbRow) return null;
      versionStr = String(dbRow.version);
      // Cache version pointer with short TTL (60s)
      await this.redis.setex(versionKey, 60, versionStr);
    }

    // 2. Fetch payload using versioned key
    const dataKey = `user:${uuid}:v${versionStr}`;
    const cachedData = await this.redis.get(dataKey);

    if (cachedData) {
      return { source: 'CACHE_HIT', data: JSON.parse(cachedData), version: versionStr };
    }

    // 3. Data Cache Miss: Fetch from DB and populate versioned key (TTL 24h)
    const dbUser = queryUserByUuid(uuid) as any;
    if (!dbUser) return null;

    await this.redis.setex(dataKey, 86400, JSON.stringify(dbUser));
    return { source: 'DB_FETCH', data: dbUser, version: versionStr };
  }

  async updateUser(uuid: string, newBio: string): Promise<any> {
    // 1. Atomically update DB row and increment version in SQLite transaction
    const updatedUser = updateUserBioAndVersion(uuid, newBio) as any;

    // 2. Invalidate only the small version pointer key (or write back new version)
    const versionKey = `user:${uuid}:version`;
    await this.redis.del(versionKey);

    // 3. Proactively cache new versioned payload
    const newDataKey = `user:${uuid}:v${updatedUser.version}`;
    await this.redis.setex(newDataKey, 86400, JSON.stringify(updatedUser));

    return updatedUser;
  }
}
