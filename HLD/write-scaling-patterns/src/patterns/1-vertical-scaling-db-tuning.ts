import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * PATTERN 1: Vertical Scaling & Database Engine Tuning
 * 
 * Demonstrates:
 * 1. Storage Engine Overhead & Synchronous Disk Flush (B-Tree page dirtying + fsync)
 * 2. WAL Mode Optimization (Write-Ahead Logging sequential append)
 * 3. Atomic Transaction Batching (Amortizing commit overhead across N updates)
 */

const DB_PATH_UNOPTIMIZED = path.join(process.cwd(), 'benchmark_unoptimized.db');
const DB_PATH_OPTIMIZED = path.join(process.cwd(), 'benchmark_optimized.db');

export interface BenchmarkResult {
  mode: string;
  totalOps: number;
  totalTimeMs: number;
  opsPerSec: number;
  avgLatencyMs: number;
}

function cleanupDatabases() {
  const filesToDelete = [
    DB_PATH_UNOPTIMIZED,
    `${DB_PATH_UNOPTIMIZED}-journal`,
    `${DB_PATH_UNOPTIMIZED}-wal`,
    `${DB_PATH_UNOPTIMIZED}-shm`,
    DB_PATH_OPTIMIZED,
    `${DB_PATH_OPTIMIZED}-journal`,
    `${DB_PATH_OPTIMIZED}-wal`,
    `${DB_PATH_OPTIMIZED}-shm`,
  ];
  for (const f of filesToDelete) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }
}

export function runVerticalScalingBenchmark(numRows: number = 2000): BenchmarkResult[] {
  cleanupDatabases();
  const results: BenchmarkResult[] = [];

  console.log(`\n===============================================================`);
  console.log(`🚀 PATTERN 1: DATABASE ENGINE TUNING & WAL BENCHMARK (${numRows} ROW INSERTS)`);
  console.log(`===============================================================\n`);

  // -----------------------------------------------------------------
  // SETUP 1: UN-TUNED DATABASE (DELETE Journal Mode, Full Sync)
  // -----------------------------------------------------------------
  const dbUnoptimized = new Database(DB_PATH_UNOPTIMIZED);
  dbUnoptimized.pragma('journal_mode = DELETE');
  dbUnoptimized.pragma('synchronous = FULL');
  dbUnoptimized.exec(`
    CREATE TABLE telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      metric_val REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insertUnoptimized = dbUnoptimized.prepare(
    'INSERT INTO telemetry_events (device_id, metric_val) VALUES (?, ?)'
  );

  // Measure individual autocommit inserts (each fires disk sync)
  const startUnoptimized = performance.now();
  for (let i = 0; i < numRows; i++) {
    insertUnoptimized.run(`device_${i % 50}`, Math.random() * 100);
  }
  const timeUnoptimizedMs = performance.now() - startUnoptimized;
  dbUnoptimized.close();

  results.push({
    mode: 'Un-tuned (DELETE Journal + FULL Sync + Auto-commit)',
    totalOps: numRows,
    totalTimeMs: timeUnoptimizedMs,
    opsPerSec: Math.round((numRows / timeUnoptimizedMs) * 1000),
    avgLatencyMs: Number((timeUnoptimizedMs / numRows).toFixed(4)),
  });

  // -----------------------------------------------------------------
  // SETUP 2: TUNED WAL MODE (Write-Ahead Logging + NORMAL Sync)
  // -----------------------------------------------------------------
  const dbOptimizedWAL = new Database(DB_PATH_OPTIMIZED);
  dbOptimizedWAL.pragma('journal_mode = WAL');
  dbOptimizedWAL.pragma('synchronous = NORMAL');
  dbOptimizedWAL.exec(`
    CREATE TABLE telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      metric_val REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const insertWAL = dbOptimizedWAL.prepare(
    'INSERT INTO telemetry_events (device_id, metric_val) VALUES (?, ?)'
  );

  const startWAL = performance.now();
  for (let i = 0; i < numRows; i++) {
    insertWAL.run(`device_${i % 50}`, Math.random() * 100);
  }
  const timeWALMs = performance.now() - startWAL;

  results.push({
    mode: 'WAL Mode (WAL Journal + NORMAL Sync + Auto-commit)',
    totalOps: numRows,
    totalTimeMs: timeWALMs,
    opsPerSec: Math.round((numRows / timeWALMs) * 1000),
    avgLatencyMs: Number((timeWALMs / numRows).toFixed(4)),
  });

  // -----------------------------------------------------------------
  // SETUP 3: WAL MODE + ATOMIC TRANSACTION BATCHING
  // -----------------------------------------------------------------
  const insertBatchWAL = dbOptimizedWAL.prepare(
    'INSERT INTO telemetry_events (device_id, metric_val) VALUES (?, ?)'
  );

  const batchTransaction = dbOptimizedWAL.transaction((rows: { deviceId: string; val: number }[]) => {
    for (const row of rows) {
      insertBatchWAL.run(row.deviceId, row.val);
    }
  });

  const batchData = Array.from({ length: numRows }, (_, i) => ({
    deviceId: `device_${i % 50}`,
    val: Math.random() * 100,
  }));

  const startBatch = performance.now();
  batchTransaction(batchData);
  const timeBatchMs = performance.now() - startBatch;
  dbOptimizedWAL.close();

  results.push({
    mode: 'WAL Mode + Transaction Batching (Atomic Bulk Insert)',
    totalOps: numRows,
    totalTimeMs: timeBatchMs,
    opsPerSec: Math.round((numRows / timeBatchMs) * 1000),
    avgLatencyMs: Number((timeBatchMs / numRows).toFixed(4)),
  });

  // Print Comparison Table
  console.table(
    results.map((r) => ({
      'Execution Mode': r.mode,
      'Total Operations': r.totalOps,
      'Total Time (ms)': r.totalTimeMs.toFixed(2),
      'Throughput (Ops/Sec)': r.opsPerSec,
      'Avg Latency (ms/op)': r.avgLatencyMs,
    }))
  );

  const speedup = (results[0].totalTimeMs / results[2].totalTimeMs).toFixed(1);
  console.log(`\n💡 INSIGHT: WAL Mode + Transaction Batching achieved a ${speedup}x speedup over un-tuned autocommit inserts!\n`);

  cleanupDatabases();
  return results;
}

if (process.argv[1] && process.argv[1].endsWith('1-vertical-scaling-db-tuning.ts')) {
  runVerticalScalingBenchmark();
}
