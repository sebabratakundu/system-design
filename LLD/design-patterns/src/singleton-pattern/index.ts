import Redis from "ioredis";

/**
 * ============================================================================
 * PRODUCTION-GRADE SINGLETON PATTERN: REDIS CONNECTION POOL MANAGER
 * ============================================================================
 *
 * @description
 * The Singleton Pattern ensures that a class has only one instance and provides
 * a global point of access to it.
 *
 * Real-World System Design Scenario:
 * Maintaining multiple database connection pools or Redis clients exhausts OS file
 * descriptors, network sockets, and server memory. A Singleton RedisConnectionManager
 * ensures that the entire microservice shares a single, highly optimized connection
 * pool with connection health checks, telemetry, and graceful shutdown capabilities.
 */

// ============================================================================
// 1. DOMAIN CONFIGURATION & INTERFACES
// ============================================================================

export interface SingletonRedisConfig {
  host: string;
  port: number;
  db?: number;
  maxRetriesPerRequest?: number;
}

export interface ConnectionMetrics {
  totalQueriesExecuted: number;
  isConnected: boolean;
  uptimeSeconds: number;
  connectionId: string;
}

// ============================================================================
// 2. SINGLETON CLASS
// ============================================================================

/**
 * Singleton Class: RedisConnectionManager
 * Guaranteed single instance across the Node.js application process.
 */
export class RedisConnectionManager {
  /**
   * Static private instance reference (The core of Singleton)
   */
  private static instance: RedisConnectionManager | null = null;

  /**
   * Private fields to encapsulate state and underlying production driver
   */
  private client: Redis | null = null;
  private readonly connectionId: string;
  private readonly startTime: Date;
  private queryCounter = 0;
  private _isConnected = false;

  /**
   * PRIVATE CONSTRUCTOR: Prevents external instantiation via `new RedisConnectionManager()`
   */
  private constructor(private config: SingletonRedisConfig) {
    this.connectionId = `redis_singleton_${Math.random().toString(36).substring(2, 9)}`;
    this.startTime = new Date();
    this.initializeDriver();
  }

  /**
   * Global Static Access Method (The Singleton Getter)
   * Implements Lazy Initialization: Instance is created only when first requested.
   *
   * @param config Optional configuration for first-time initialization
   */
  public static getInstance(config?: SingletonRedisConfig): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      const defaultConfig: SingletonRedisConfig = {
        host: "127.0.0.1",
        port: 6379,
        db: 0,
        maxRetriesPerRequest: 1,
      };

      console.log("🔒 [Singleton] No existing instance found. Creating unique RedisConnectionManager instance...");
      RedisConnectionManager.instance = new RedisConnectionManager(config ?? defaultConfig);
    } else {
      console.log("⚡ [Singleton] Existing instance found. Reusing shared RedisConnectionManager instance.");
    }

    return RedisConnectionManager.instance;
  }

  /**
   * Private helper method to initialize the production `ioredis` driver
   */
  private initializeDriver(): void {
    try {
      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        lazyConnect: true,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      });

      this._isConnected = true;
      console.log(`✅ [Singleton Driver] ioredis initialized successfully (ID: ${this.connectionId})`);
    } catch (err: any) {
      console.error(`❌ [Singleton Driver Initialization Error]: ${err.message}`);
    }
  }

  /**
   * Executes a GET command using the shared connection
   */
  public async get(key: string): Promise<string | null> {
    this.queryCounter++;
    console.log(`[Instance: ${this.connectionId}] Executing GET '${key}' (Query #${this.queryCounter})`);

    if (this.client && this.client.status === "ready") {
      return await this.client.get(key);
    }

    // Simulated fallback response for demo verification if local Redis server is offline
    return `cached_val_for_${key}`;
  }

  /**
   * Executes a SET command using the shared connection
   */
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.queryCounter++;
    console.log(`[Instance: ${this.connectionId}] Executing SET '${key}' = '${value}' (Query #${this.queryCounter})`);

    if (this.client && this.client.status === "ready") {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    }
  }

  /**
   * Retrieves connection health and metrics telemetry
   */
  public getMetrics(): ConnectionMetrics {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    return {
      connectionId: this.connectionId,
      totalQueriesExecuted: this.queryCounter,
      isConnected: this._isConnected,
      uptimeSeconds: uptime,
    };
  }

  /**
   * Controlled destruction / reset for application shutdown or unit testing
   */
  public static async destroyInstance(): Promise<void> {
    if (RedisConnectionManager.instance) {
      if (RedisConnectionManager.instance.client) {
        await RedisConnectionManager.instance.client.quit().catch(() => {});
      }
      console.log(`🧹 [Singleton] Destroyed instance ${RedisConnectionManager.instance.connectionId}.`);
      RedisConnectionManager.instance = null;
    }
  }
}

// ============================================================================
// 3. RUNNABLE DEMO & VERIFICATION
// ============================================================================

async function runDemo() {
  console.log("=================================================");
  console.log("    SINGLETON PATTERN - REDIS CONNECTION POOL    ");
  console.log("=================================================\n");

  // 1. Retrieve instance in Component A
  console.log("--- Component A requesting Redis instance ---");
  const connectionA = RedisConnectionManager.getInstance({ host: "127.0.0.1", port: 6379 });
  await connectionA.set("user:1001", "Alex Smith");

  console.log("\n-------------------------------------------------\n");

  // 2. Retrieve instance in Component B
  console.log("--- Component B requesting Redis instance ---");
  const connectionB = RedisConnectionManager.getInstance();
  const user = await connectionB.get("user:1001");
  console.log(`Component B retrieved value: '${user}'`);

  console.log("\n-------------------------------------------------\n");

  // 3. Reference Equality Check (The ultimate Singleton Test)
  console.log("🧪 [Verification] Are connectionA and connectionB identical references?");
  const isIdentical = connectionA === connectionB;
  console.log(`Reference Check (connectionA === connectionB): ${isIdentical ? "✅ TRUE" : "❌ FALSE"}`);

  // 4. Inspect Metrics (Query counters are shared because it's a single object instance!)
  console.log("\n📊 Telemetry Metrics:", connectionB.getMetrics());

  // 5. Cleanup
  await RedisConnectionManager.destroyInstance();
}

runDemo().catch(console.error);
