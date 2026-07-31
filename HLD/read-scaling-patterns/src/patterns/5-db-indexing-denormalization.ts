import { db } from "../db/database.js";

/**
 * PATTERN 5: Database Indexing & Strategic Denormalization
 *
 * Demonstrates:
 *  1. Un-indexed Full Table Scan vs B-Tree Indexed Lookup performance.
 *  2. Verification via SQL `EXPLAIN QUERY PLAN` output.
 *  3. Strategic Denormalization eliminating runtime JOIN operations.
 */

export function benchmarkIndexingAndDenormalization() {
  console.log(
    "\n--- Stage 1A: B-Tree Indexing Benchmark & EXPLAIN Verification ---",
  );

  // 1. Un-indexed query benchmark (Querying on non-indexed column 'bio')
  const unindexedSql =
    "SELECT * FROM users WHERE bio LIKE '%Software Engineer #4059%'";

  // Fetch SQLite Query Execution Plan
  const unindexedExplain = db
    .prepare(`EXPLAIN QUERY PLAN ${unindexedSql}`)
    .all() as Array<{ detail: string }>;
  const unindexedPlanDetail = unindexedExplain.map((e) => e.detail).join(" | ");

  const startUnindexed = process.hrtime.bigint();
  const unindexedResult = db.prepare(unindexedSql).all();
  const endUnindexed = process.hrtime.bigint();
  const unindexedTimeMs = Number(endUnindexed - startUnindexed) / 1_000_000;

  // 2. B-Tree Indexed query benchmark (Querying on indexed column 'email')
  const indexedSql =
    "SELECT * FROM users WHERE email = 'user_4059@example.com'";

  // Fetch SQLite Query Execution Plan
  const indexedExplain = db
    .prepare(`EXPLAIN QUERY PLAN ${indexedSql}`)
    .all() as Array<{ detail: string }>;
  const indexedPlanDetail = indexedExplain.map((e) => e.detail).join(" | ");

  const startIndexed = process.hrtime.bigint();
  const indexedResult = db.prepare(indexedSql).get();
  const endIndexed = process.hrtime.bigint();
  const indexedTimeMs = Number(endIndexed - startIndexed) / 1_000_000;

  console.table({
    "Un-indexed Scan (Full Table Scan)": {
      "Execution Time (ms)": `${unindexedTimeMs.toFixed(3)} ms`,
      "SQL Query Plan (EXPLAIN)": unindexedPlanDetail,
      "Rows Found": unindexedResult.length,
    },
    "B-Tree Indexed Scan": {
      "Execution Time (ms)": `${indexedTimeMs.toFixed(3)} ms`,
      "SQL Query Plan (EXPLAIN)": indexedPlanDetail,
      "Rows Found": indexedResult ? 1 : 0,
    },
  });

  console.log(
    "\n--- Stage 1B: Strategic Denormalization & EXPLAIN Verification ---",
  );

  // Setup normalized vs denormalized tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders_normalized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      product_id INTEGER,
      quantity INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products_normalized (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      price DECIMAL(10, 2)
    );

    CREATE TABLE IF NOT EXISTS user_order_summary_denormalized (
      order_id INTEGER PRIMARY KEY,
      user_id INTEGER,
      user_name TEXT,
      product_name TEXT,
      price DECIMAL(10, 2),
      quantity INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_orders_norm_user ON orders_normalized(user_id);
    CREATE INDEX IF NOT EXISTS idx_denorm_user ON user_order_summary_denormalized(user_id);
  `);

  const countOrders = (
    db.prepare("SELECT COUNT(*) as c FROM orders_normalized").get() as any
  ).c;
  if (countOrders === 0) {
    const insertProducts = db.prepare(
      "INSERT OR IGNORE INTO products_normalized (id, name, price) VALUES (?, ?, ?)",
    );

    const insertNorm = db.prepare(
      "INSERT OR IGNORE INTO orders_normalized (user_id, product_id, quantity) VALUES (?, ?, ?)",
    );
    const insertDenorm = db.prepare(
      "INSERT OR IGNORE INTO user_order_summary_denormalized (order_id, user_id, user_name, product_name, price, quantity) VALUES (?, ?, ?, ?, ?, ?)",
    );

    const seedTx = db.transaction(() => {
      for (let i = 1; i <= 5000; i++) {
        insertProducts.run(i, `Pro Wireless Headset ${i}`, 199.99);
        insertNorm.run(i, i, 2);
        insertDenorm.run(i, i, `Pro Wireless Headset ${i}`, 199.99, 2);
      }
    });
    seedTx();
  }

  // Ensure index on denormalized table exists
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_denorm_user ON user_order_summary_denormalized(user_id);",
  );

  // 1. Normalized Query with JOINs
  const joinSql = `
    SELECT u.name as user_name, p.name as product_name, p.price, o.quantity
    FROM users u
    JOIN orders_normalized o ON u.id = o.user_id
    JOIN products_normalized p ON o.product_id = p.id
    WHERE u.id = 4059
  `;

  const joinExplain = db
    .prepare(`EXPLAIN QUERY PLAN ${joinSql}`)
    .all() as Array<{ detail: string }>;
  const joinPlanDetail = joinExplain.map((e) => e.detail).join(" -> ");

  const startJoin = process.hrtime.bigint();
  const joinResult = db.prepare(joinSql).all();
  const endJoin = process.hrtime.bigint();
  const joinTimeMs = Number(endJoin - startJoin) / 1_000_000;

  // 2. Denormalized Single-Table Lookup
  const denormSql = `
    SELECT user_name, product_name, price, quantity
    FROM user_order_summary_denormalized
    WHERE user_id = 4059
  `;

  const denormExplain = db
    .prepare(`EXPLAIN QUERY PLAN ${denormSql}`)
    .all() as Array<{ detail: string }>;
  const denormPlanDetail = denormExplain.map((e) => e.detail).join(" -> ");

  const startDenorm = process.hrtime.bigint();
  const denormResult = db.prepare(denormSql).all();
  const endDenorm = process.hrtime.bigint();
  const denormTimeMs = Number(endDenorm - startDenorm) / 1_000_000;

  console.table({
    "Normalized Query (Multi-table JOINs)": {
      "Execution Time (ms)": `${joinTimeMs.toFixed(3)} ms`,
      "SQL Query Plan (EXPLAIN)": joinPlanDetail,
      "Rows Returned": joinResult.length,
    },
    "Denormalized Query (Single-Table Lookup)": {
      "Execution Time (ms)": `${denormTimeMs.toFixed(3)} ms`,
      "SQL Query Plan (EXPLAIN)": denormPlanDetail,
      "Rows Returned": denormResult.length,
    },
  });
}

// Auto-run if executed directly via pnpm pattern-5
if (process.argv[1]?.endsWith("5-db-indexing-denormalization.ts")) {
  benchmarkIndexingAndDenormalization();
}
