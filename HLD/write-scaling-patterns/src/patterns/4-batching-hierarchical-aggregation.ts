/**
 * PATTERN 4: Micro-Batching & Multi-Tier Hierarchical Aggregation
 * 
 * Demonstrates:
 * 1. Intermediate Micro-Batcher (Window & Max Size Triggered Flush)
 * 2. Multi-Tier Hierarchical Aggregation Tree (Leaf Ingest -> Regional Aggregators -> Root Broadcaster)
 */

export interface AggregationEvent {
  entityId: string;
  count: number;
}

/**
 * Intermediate Micro-Batcher
 */
export class MicroBatcher {
  private buffer: Map<string, number> = new Map();
  private batchSizeLimit: number;
  private flushIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private onFlush: (batches: Map<string, number>) => Promise<void>;
  public totalFlushes: number = 0;
  public totalEventsIngested: number = 0;

  constructor(
    batchSizeLimit: number = 100,
    flushIntervalMs: number = 50,
    onFlush: (batches: Map<string, number>) => Promise<void>
  ) {
    this.batchSizeLimit = batchSizeLimit;
    this.flushIntervalMs = flushIntervalMs;
    this.onFlush = onFlush;
    this.startTimer();
  }

  private startTimer() {
    this.timer = setInterval(() => {
      this.flush('TIMER_EXPIRED');
    }, this.flushIntervalMs);
  }

  public async add(entityId: string, delta: number = 1) {
    this.totalEventsIngested += delta;
    const current = this.buffer.get(entityId) || 0;
    this.buffer.set(entityId, current + delta);

    if (this.buffer.size >= this.batchSizeLimit) {
      await this.flush('MAX_BATCH_SIZE_REACHED');
    }
  }

  public async flush(reason: string): Promise<number> {
    if (this.buffer.size === 0) return 0;

    const currentBatch = new Map(this.buffer);
    this.buffer.clear();
    this.totalFlushes++;

    await this.onFlush(currentBatch);
    return currentBatch.size;
  }

  public destroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

/**
 * Hierarchical Aggregation Tree Node
 */
export class HierarchicalNode {
  public id: string;
  public tierName: string;
  private localCounts: Map<string, number> = new Map();
  private parentNode: HierarchicalNode | null;
  public totalEventsHandled: number = 0;
  public totalUpstreamWrites: number = 0;

  constructor(id: string, tierName: string, parentNode: HierarchicalNode | null = null) {
    this.id = id;
    this.tierName = tierName;
    this.parentNode = parentNode;
  }

  public recordEvent(entityId: string, count: number = 1) {
    this.totalEventsHandled += count;
    const current = this.localCounts.get(entityId) || 0;
    this.localCounts.set(entityId, current + count);
  }

  /**
   * Flushes aggregated delta totals to upstream parent node
   */
  public flushUpstream() {
    if (this.localCounts.size === 0) return;

    if (this.parentNode) {
      for (const [entityId, delta] of this.localCounts.entries()) {
        this.parentNode.recordEvent(entityId, delta);
        this.totalUpstreamWrites++;
      }
    }
    this.localCounts.clear();
  }

  public getSnapshot(): Map<string, number> {
    return new Map(this.localCounts);
  }
}

export async function runBatchingAndHierarchicalDemo() {
  console.log(`\n===============================================================`);
  console.log(`🚀 PATTERN 4: MICRO-BATCHING & HIERARCHICAL AGGREGATION DEMO`);
  console.log(`===============================================================\n`);

  // 1. Intermediate Micro-Batcher Demo
  console.log(`--- 1. INTERMEDIATE MICRO-BATCHER (LIKE BATCHER) ---`);
  let dbUpdateCount = 0;
  const dbStore: Map<string, number> = new Map();

  const batcher = new MicroBatcher(5, 100, async (batch) => {
    dbUpdateCount++;
    for (const [key, delta] of batch.entries()) {
      const existing = dbStore.get(key) || 0;
      dbStore.set(key, existing + delta);
    }
  });

  const TOTAL_LIKE_EVENTS = 500;
  const targetPosts = ['post_101', 'post_102', 'post_103', 'post_104', 'post_105'];

  console.log(`⚡ Firing ${TOTAL_LIKE_EVENTS} individual 'Like' events targeting 5 posts...`);
  for (let i = 0; i < TOTAL_LIKE_EVENTS; i++) {
    const targetPost = targetPosts[i % targetPosts.length];
    await batcher.add(targetPost, 1);
  }

  // Force final flush
  await batcher.flush('FINAL_DRAIN');
  batcher.destroy();

  console.log(`  ✅ Micro-Batcher Result:`);
  console.log(`     Total Raw Events Ingested: ${batcher.totalEventsIngested}`);
  console.log(`     Total Database Batch Writes Executed: ${dbUpdateCount} (vs ${TOTAL_LIKE_EVENTS} without batching)`);
  console.log(`     Write Operations Reduction Factor: ${(TOTAL_LIKE_EVENTS / dbUpdateCount).toFixed(1)}x reduction!`);

  console.table(
    Array.from(dbStore.entries()).map(([postId, finalCount]) => ({
      'Post Identifier': postId,
      'Final DB Counter': finalCount,
    }))
  );

  // 2. Multi-Tier Hierarchical Aggregation Tree Demo
  console.log(`\n--- 2. MULTI-TIER HIERARCHICAL AGGREGATION TREE (LIVE STREAM REACTION STREAM) ---`);
  
  // Build 3-Tier Tree Architecture
  const rootNode = new HierarchicalNode('root_master', 'Tier 3 (Root Broadcaster)');
  
  const regionalEast = new HierarchicalNode('regional_us_east', 'Tier 2 (Regional Aggregator)', rootNode);
  const regionalWest = new HierarchicalNode('regional_us_west', 'Tier 2 (Regional Aggregator)', rootNode);

  const leafIngest1 = new HierarchicalNode('leaf_ingest_1', 'Tier 1 (Leaf Worker)', regionalEast);
  const leafIngest2 = new HierarchicalNode('leaf_ingest_2', 'Tier 1 (Leaf Worker)', regionalEast);
  const leafIngest3 = new HierarchicalNode('leaf_ingest_3', 'Tier 1 (Leaf Worker)', regionalWest);
  const leafIngest4 = new HierarchicalNode('leaf_ingest_4', 'Tier 1 (Leaf Worker)', regionalWest);

  const leafNodes = [leafIngest1, leafIngest2, leafIngest3, leafIngest4];
  const streamCommentId = 'comment_live_99';
  const RAW_USER_REACTIONS = 10000;

  console.log(`⚡ Simulating ${RAW_USER_REACTIONS} reaction events across 4 Leaf Ingest Workers...`);
  for (let i = 0; i < RAW_USER_REACTIONS; i++) {
    const targetLeaf = leafNodes[i % leafNodes.length];
    targetLeaf.recordEvent(streamCommentId, 1);
  }

  // Tier 1 Flush to Tier 2
  for (const leaf of leafNodes) {
    leaf.flushUpstream();
  }

  // Tier 2 Flush to Tier 3 (Root)
  regionalEast.flushUpstream();
  regionalWest.flushUpstream();

  const rootSnapshot = rootNode.getSnapshot();
  const rootTotal = rootSnapshot.get(streamCommentId) || 0;

  const totalLeafWrites = leafNodes.reduce((sum, n) => sum + n.totalUpstreamWrites, 0);
  const totalRegionalWrites = regionalEast.totalUpstreamWrites + regionalWest.totalUpstreamWrites;
  const totalUpstreamWritesInTree = totalLeafWrites + totalRegionalWrites;

  console.log(`  ✅ Hierarchical Tree Aggregation Summary:`);
  console.log(`     Raw User Reactions Ingested at Leaves: ${RAW_USER_REACTIONS}`);
  console.log(`     Total Leaf -> Regional Upstream Messages: ${totalLeafWrites}`);
  console.log(`     Total Regional -> Root Upstream Messages: ${totalRegionalWrites}`);
  console.log(`     Root Broadcaster Final Aggregated Total: ${rootTotal}`);
  console.log(`     Root Node Write Overhead: ${totalRegionalWrites} writes (vs ${RAW_USER_REACTIONS} writes without hierarchy!)`);
  console.log(`     Root Write Amplification Reduction: ${(RAW_USER_REACTIONS / totalRegionalWrites).toFixed(1)}x reduction!`);
}

if (process.argv[1] && process.argv[1].endsWith('4-batching-hierarchical-aggregation.ts')) {
  runBatchingAndHierarchicalDemo();
}
