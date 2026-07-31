import { runVerticalScalingBenchmark } from './patterns/1-vertical-scaling-db-tuning.js';
import { runShardingAndHotkeyDemo } from './patterns/2-sharding-hotkey-partitioning.js';
import { runQueuesAndLoadSheddingDemo } from './patterns/3-write-queues-load-shedding.js';
import { runBatchingAndHierarchicalDemo } from './patterns/4-batching-hierarchical-aggregation.js';

async function runAllWriteScalingPatterns() {
  console.log('\n===============================================================');
  console.log('🚀 SYSTEM DESIGN WRITE SCALING PATTERNS - PRODUCTION BENCHMARKS');
  console.log('===============================================================\n');

  // 1. Pattern 1: Vertical Scaling & WAL Database Engine Tuning
  runVerticalScalingBenchmark(2500);

  // 2. Pattern 2: Sharding & Hot Key Management
  await runShardingAndHotkeyDemo();

  // 3. Pattern 3: Handling Bursts with Queues & Load Shedding
  await runQueuesAndLoadSheddingDemo();

  // 4. Pattern 4: Micro-Batching & Hierarchical Aggregation
  await runBatchingAndHierarchicalDemo();

  console.log('\n===============================================================');
  console.log('✅ ALL 4 WRITE SCALING BENCHMARKS COMPLETED SUCCESSFULLY!');
  console.log('===============================================================\n');
}

runAllWriteScalingPatterns().catch((err) => {
  console.error('❌ Error executing Write Scaling benchmarks:', err);
  process.exit(1);
});
