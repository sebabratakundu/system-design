import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';

// Interface for unified Redis operations
export interface IRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK'>;
  setex(key: string, seconds: number, value: string): Promise<'OK'>;
  del(key: string | string[]): Promise<number>;
  pipeline(): any;
  quit(): Promise<void>;
  isRealRedis: boolean;
}

// Fallback in-memory Redis driver powered by LRUCache & Map for environments without standalone Redis daemon
class InMemoryRedis implements IRedisClient {
  private store = new LRUCache<string, { value: string; expiresAt?: number }>({ max: 50000 });
  public isRealRedis = false;

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    const expiresAt = Date.now() + seconds * 1000;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.store.has(k)) {
        this.store.delete(k);
        count++;
      }
    }
    return count;
  }

  pipeline(): any {
    const commands: Array<() => Promise<any>> = [];
    const pipe = {
      setex: (key: string, seconds: number, value: string) => {
        commands.push(() => this.setex(key, seconds, value));
        return pipe;
      },
      get: (key: string) => {
        commands.push(() => this.get(key));
        return pipe;
      },
      exec: async () => {
        const results = [];
        for (const cmd of commands) {
          results.push([null, await cmd()]);
        }
        return results;
      }
    };
    return pipe;
  }

  async quit(): Promise<void> {}
}

export async function createRedisClient(): Promise<IRedisClient> {
  const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // Don't hang if local Redis daemon isn't running
    lazyConnect: true
  });

  try {
    await redis.connect();
    console.log('🔌 Connected to local Redis server (127.0.0.1:6379)');
    return Object.assign(redis, { isRealRedis: true });
  } catch {
    console.log('💡 Local Redis daemon not detected; utilizing production-grade In-Memory Cache Driver (LRUCache wrapper).');
    return new InMemoryRedis();
  }
}
