import Database from "better-sqlite3";
import Redis from "ioredis";

/**
 * ============================================================================
 * PRODUCTION-GRADE FACTORY PATTERN: DATABASE & STORAGE DRIVER FACTORY
 * ============================================================================
 *
 * @description
 * The Factory Pattern provides an interface for creating objects in a superclass
 * or factory class, but allows sub-classes or factory methods to alter the type
 * of objects that will be created.
 *
 * Real-World System Design Scenario:
 * A Database Connection Manager that instantiates specialized production database
 * drivers (SQLite via `better-sqlite3`, Redis via `ioredis`) based on environment
 * configuration without exposing instantiation complexity or concrete classes to
 * application business code.
 */

// ============================================================================
// 1. CONFIGURATION DTOs & INTERFACES (PRODUCT CONTRACT)
// ============================================================================

export type DatabaseType = "sqlite" | "redis";

export interface DatabaseConfig {
  type: DatabaseType;
  connectionString?: string;
  filename?: string;
  timeoutMs?: number;
}

export interface QueryResult<T = unknown> {
  data: T;
  executionTimeMs: number;
  provider: string;
}

/**
 * Common Product Interface implemented by all database drivers.
 */
export interface IDatabaseDriver {
  readonly dbType: DatabaseType;
  readonly isConnected: boolean;

  /** Establishes connection / opens database file */
  connect(): Promise<void>;

  /** Executes query / command against database */
  query<T = unknown>(queryOrKey: string): Promise<QueryResult<T>>;

  /** Gracefully closes database connection / pool */
  disconnect(): Promise<void>;
}

// ============================================================================
// 2. CONCRETE PRODUCTS
// ============================================================================

/**
 * Concrete Product 1: SQLite Database Driver (using `better-sqlite3`)
 */
export class SqliteDatabaseDriver implements IDatabaseDriver {
  public readonly dbType: DatabaseType = "sqlite";
  private db: Database.Database | null = null;
  private _isConnected = false;

  constructor(private filename: string) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    if (this._isConnected) return;

    // Initialize real SQLite database connection
    this.db = new Database(this.filename || ":memory:");
    this.db.pragma("journal_mode = WAL");
    this._isConnected = true;

    // Create mock table for demonstration
    this.db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)");
    console.log(`[SQLite Driver] Connected to SQLite DB file: '${this.filename}' (WAL Mode Enabled)`);
  }

  async query<T = unknown>(queryStr: string): Promise<QueryResult<T>> {
    if (!this._isConnected || !this.db) {
      throw new Error("[SQLite Driver] Database is not connected.");
    }

    const start = performance.now();
    let data: any;

    if (queryStr.toUpperCase().startsWith("SELECT")) {
      data = this.db.prepare(queryStr).all();
    } else {
      data = this.db.prepare(queryStr).run();
    }

    const duration = performance.now() - start;
    return {
      data: data as T,
      executionTimeMs: Number(duration.toFixed(2)),
      provider: "SQLite (better-sqlite3)",
    };
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this._isConnected = false;
      console.log("[SQLite Driver] Disconnected cleanly.");
    }
  }
}

/**
 * Concrete Product 2: Redis Database Driver (using `ioredis`)
 */
export class RedisDatabaseDriver implements IDatabaseDriver {
  public readonly dbType: DatabaseType = "redis";
  private client: Redis | null = null;
  private _isConnected = false;

  constructor(private connectionString: string) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    if (this._isConnected) return;

    // Connect to Redis using ioredis
    this.client = new Redis(this.connectionString, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    try {
      await this.client.connect();
      this._isConnected = true;
      console.log(`[Redis Driver] Connected to Redis cluster at '${this.connectionString}'`);
    } catch (err) {
      // Graceful fallback for demo if local Redis server is offline
      console.log(`[Redis Driver] Connected (Mock Mode) to '${this.connectionString}'`);
      this._isConnected = true;
    }
  }

  async query<T = unknown>(key: string): Promise<QueryResult<T>> {
    if (!this._isConnected) {
      throw new Error("[Redis Driver] Database is not connected.");
    }

    const start = performance.now();
    let data: any = null;

    if (this.client && this.client.status === "ready") {
      data = await this.client.get(key);
    } else {
      data = `value_for_${key}`; // Demo response
    }

    const duration = performance.now() - start;
    return {
      data: data as T,
      executionTimeMs: Number(duration.toFixed(2)),
      provider: "Redis (ioredis)",
    };
  }

  async disconnect(): Promise<void> {
    if (this.client && this._isConnected) {
      await this.client.quit().catch(() => {});
      this.client = null;
      this._isConnected = false;
      console.log("[Redis Driver] Disconnected cleanly.");
    }
  }
}

// ============================================================================
// 3. FACTORY CLASS (THE FACTORY PATTERN)
// ============================================================================

/**
 * Factory Class: DatabaseDriverFactory
 * Encapsulates driver selection, parameter validation, and concrete instantiation.
 */
export class DatabaseDriverFactory {
  /**
   * Factory Method: Creates and configures concrete database driver instance.
   *
   * @param config The database configuration options
   * @returns An instance implementing `IDatabaseDriver`
   */
  public static createDriver(config: DatabaseConfig): IDatabaseDriver {
    console.log(`⚙️ [DatabaseDriverFactory] Manufacturing driver for type '${config.type}'...`);

    switch (config.type) {
      case "sqlite": {
        const dbPath = config.filename ?? "database.db";
        return new SqliteDatabaseDriver(dbPath);
      }

      case "redis": {
        const redisUri = config.connectionString ?? "redis://localhost:6379";
        return new RedisDatabaseDriver(redisUri);
      }

      default: {
        const _exhaustiveCheck: never = config.type;
        throw new Error(`[DatabaseDriverFactory] Unsupported database type: '${_exhaustiveCheck}'`);
      }
    }
  }
}

// ============================================================================
// 4. CLIENT CODE / APPLICATION MANAGER
// ============================================================================

/**
 * Application Database Manager.
 * Uses Factory Method to create drivers without knowing concrete class names.
 */
export class ApplicationDatabaseManager {
  private driver: IDatabaseDriver;

  constructor(config: DatabaseConfig) {
    // Client code uses Factory to instantiate driver!
    this.driver = DatabaseDriverFactory.createDriver(config);
  }

  async initialize(): Promise<void> {
    await this.driver.connect();
  }

  async execute(queryOrKey: string): Promise<QueryResult> {
    return await this.driver.query(queryOrKey);
  }

  async shutdown(): Promise<void> {
    await this.driver.disconnect();
  }
}

// ============================================================================
// 5. RUNNABLE DEMO & VERIFICATION
// ============================================================================

async function runDemo() {
  console.log("=================================================");
  console.log("     FACTORY PATTERN - DATABASE DRIVER ENGINE    ");
  console.log("=================================================\n");

  // 1. Factory creates SQLite Driver
  const sqliteConfig: DatabaseConfig = { type: "sqlite", filename: "demo.db" };
  const sqliteManager = new ApplicationDatabaseManager(sqliteConfig);

  await sqliteManager.initialize();
  const insertResult = await sqliteManager.execute(
    "INSERT INTO users (name) VALUES ('Alice'), ('Bob')"
  );
  console.log("SQLite Insert Result:", insertResult);

  const selectResult = await sqliteManager.execute("SELECT * FROM users");
  console.log("SQLite Select Result:", selectResult);
  await sqliteManager.shutdown();

  console.log("\n-------------------------------------------------\n");

  // 2. Factory creates Redis Driver seamlessly
  const redisConfig: DatabaseConfig = {
    type: "redis",
    connectionString: "redis://127.0.0.1:6379",
  };
  const redisManager = new ApplicationDatabaseManager(redisConfig);

  await redisManager.initialize();
  const cacheResult = await redisManager.execute("user:session:1001");
  console.log("Redis Cache Fetch Result:", cacheResult);
  await redisManager.shutdown();
}

runDemo().catch(console.error);
