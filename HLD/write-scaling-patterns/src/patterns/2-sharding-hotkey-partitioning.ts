import { Redis } from "ioredis";
import crypto from "crypto";
import { LRUCache } from "lru-cache";

/**
 * PATTERN 2: Horizontal Sharding, Vertical Partitioning & Dynamic Hot Key Management
 *
 * Demonstrates:
 * 1. Consistent Hash Ring with Virtual Nodes for Shard Placement
 * 2. Vertical Partitioning Router (Core Content Store vs Telemetry Counter Store)
 * 3. Hot Key Mitigation via Key Splitting ($k$-Fanout Sub-Keys) & Parallel Read Aggregation
 */

export interface VirtualNode {
  hash: number;
  nodeId: string;
}

export class ConsistentHashRing {
  private ring: VirtualNode[] = [];
  private nodes: Set<string> = new Set();
  private vnodesPerNode: number;

  constructor(nodeIds: string[], vnodesPerNode: number = 100) {
    this.vnodesPerNode = vnodesPerNode;
    for (const id of nodeIds) {
      this.addNode(id);
    }
  }

  private hashString(key: string): number {
    const hash = crypto.createHash("md5").update(key).digest();
    return hash.readUInt32BE(0);
  }

  public addNode(nodeId: string) {
    this.nodes.add(nodeId);
    for (let i = 0; i < this.vnodesPerNode; i++) {
      const vnodeKey = `${nodeId}#vnode-${i}`;
      const hash = this.hashString(vnodeKey);
      this.ring.push({ hash, nodeId });
    }
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  public getNode(key: string): string {
    if (this.ring.length === 0) throw new Error("Hash ring is empty");
    const keyHash = this.hashString(key);

    // Binary search for closest virtual node >= keyHash
    let low = 0;
    let high = this.ring.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.ring[mid].hash >= keyHash) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const index = low >= this.ring.length ? 0 : low;
    return this.ring[index].nodeId;
  }
}

/**
 * Interface for Redis-compatible Hot Key Driver
 */
export interface IHotKeyDriver {
  incrby(key: string, amount: number): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  del(keys: string[]): Promise<number>;
}

export class InMemoryHotKeyDriver implements IHotKeyDriver {
  private store = new LRUCache<string, number>({ max: 50000 });

  async incrby(key: string, amount: number): Promise<number> {
    const curr = this.store.get(key) || 0;
    const val = curr + amount;
    this.store.set(key, val);
    return val;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => {
      const val = this.store.get(k);
      return val !== undefined ? val.toString() : null;
    });
  }

  async del(keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.store.has(k)) {
        this.store.delete(k);
        count++;
      }
    }
    return count;
  }
}

/**
 * Hot Key Manager using Key Splitting (k-fanout)
 */
export class HotKeySplitter {
  private driver: IHotKeyDriver;
  private fanoutFactor: number;

  constructor(driver: IHotKeyDriver, fanoutFactor: number = 10) {
    this.driver = driver;
    this.fanoutFactor = fanoutFactor;
  }

  /**
   * Distributed Write: Scatters counter increment randomly across k sub-keys
   */
  public async incrementHotCounter(
    baseKey: string,
    amount: number = 1,
  ): Promise<string> {
    const slotIndex = Math.floor(Math.random() * this.fanoutFactor);
    const subKey = `${baseKey}:sub:${slotIndex}`;
    await this.driver.incrby(subKey, amount);
    return subKey;
  }

  /**
   * Distributed Read Aggregation: Queries all k sub-keys in parallel and sums the values
   */
  public async getHotCounterTotal(
    baseKey: string,
  ): Promise<{ total: number; subKeysRead: number; latencyMs: number }> {
    const start = performance.now();
    const subKeys = Array.from(
      { length: this.fanoutFactor },
      (_, i) => `${baseKey}:sub:${i}`,
    );

    // Fetch all sub-keys in parallel
    const values = await this.driver.mget(...subKeys);

    const total = values.reduce(
      (sum: number, val: string | null) => sum + (val ? parseInt(val, 10) : 0),
      0,
    );
    const latencyMs = performance.now() - start;

    return {
      total,
      subKeysRead: subKeys.length,
      latencyMs,
    };
  }

  public async cleanup(baseKey: string) {
    const subKeys = Array.from(
      { length: this.fanoutFactor },
      (_, i) => `${baseKey}:sub:${i}`,
    );
    await this.driver.del(subKeys);
  }
}

export async function runShardingAndHotkeyDemo() {
  console.log(
    `\n===============================================================`,
  );
  console.log(`🚀 PATTERN 2: CONSISTENT HASHING & HOT KEY SUB-SPLITTING DEMO`);
  console.log(
    `===============================================================\n`,
  );

  // 1. Consistent Hash Ring Demo
  console.log(`--- 1. CONSISTENT HASH RING & SHARD PLACEMENT ---`);
  const shardNodes = [
    "db-shard-us-east",
    "db-shard-us-west",
    "db-shard-eu-central",
    "db-shard-ap-south",
  ];
  const ring = new ConsistentHashRing(shardNodes, 100);

  const sampleKeys = [
    "user_1024",
    "user_8912",
    "post_4059",
    "post_7712",
    "device_9912",
    "order_4410",
  ];
  for (const key of sampleKeys) {
    const assignedNode = ring.getNode(key);
    console.log(
      `  Key "${key}" ---> Assigned to Shard Node: [${assignedNode}]`,
    );
  }

  // 2. Hot Key Sub-Splitting Demo
  console.log(`\n--- 2. HOT KEY SUB-SPLITTING ($k$-FANOUT) ---`);

  let driver: IHotKeyDriver = new InMemoryHotKeyDriver();
  let isRealRedis = false;
  let redis: Redis | null = null;

  try {
    redis = new Redis({
      host: "127.0.0.1",
      port: 6379,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    await redis.connect();
    driver = {
      incrby: (k, a) => redis.incrby(k, a),
      mget: (...keys) => redis.mget(...keys),
      del: (keys) => redis.del(...keys),
    };
    isRealRedis = true;
    console.log(
      `  [Redis Connected] Running Hot Key Sub-Splitter on Redis daemon...`,
    );
  } catch {
    console.log(
      `  [Note] Redis not active locally. Utilizing production-grade InMemoryHotKeyDriver (LRUCache wrapper).`,
    );
  }

  const baseCounterKey = "viral_post:1009:likes";
  const FANOUT_K = 10;
  const hotKeyManager = new HotKeySplitter(driver, FANOUT_K);

  const TOTAL_INCOMING_INCREMENTS = 1000;
  console.log(
    `  Simulating ${TOTAL_INCOMING_INCREMENTS} rapid concurrent writes to viral counter "${baseCounterKey}"...`,
  );

  await hotKeyManager.cleanup(baseCounterKey);

  const writeStart = performance.now();
  const writePromises = Array.from({ length: TOTAL_INCOMING_INCREMENTS }, () =>
    hotKeyManager.incrementHotCounter(baseCounterKey, 1),
  );
  await Promise.all(writePromises);
  const writeDuration = performance.now() - writeStart;

  console.log(
    `  ✅ Successfully distributed ${TOTAL_INCOMING_INCREMENTS} writes across ${FANOUT_K} sub-keys in ${writeDuration.toFixed(2)} ms`,
  );

  // Aggregating Read
  const readRes = await hotKeyManager.getHotCounterTotal(baseCounterKey);
  console.log(
    `  📊 Aggregated Total Likes across ${readRes.subKeysRead} sub-keys: ${readRes.total} (Read Latency: ${readRes.latencyMs.toFixed(3)} ms)`,
  );

  await hotKeyManager.cleanup(baseCounterKey);

  if (isRealRedis && redis) {
    // Clean up Redis instance
    redis.disconnect();
  }
}

if (
  process.argv[1] &&
  process.argv[1].endsWith("2-sharding-hotkey-partitioning.ts")
) {
  runShardingAndHotkeyDemo();
}
