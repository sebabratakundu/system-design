import { initDatabase, queryUserByEmail } from './db/database.js';
import { createRedisClient } from './db/redisClient.js';
import { benchmarkIndexingAndDenormalization } from './patterns/5-db-indexing-denormalization.js';
import { ReadReplicaCluster } from './patterns/6-read-replicas-routing.js';
import { AppCacheAside } from './patterns/7-app-cache-aside.js';
import { SingleFlight } from './patterns/1-singleflight.js';
import { VersionedCache } from './patterns/2-cache-versioning.js';
import { XFetchCache } from './patterns/3-xfetch.js';
import { KeyFanoutCache } from './patterns/4-key-fanout.js';

async function runAllReadScalingBenchmarks() {
  console.log('\n===============================================================');
  console.log('🚀 COMPLETE STAGE-BY-STAGE READ SCALING BENCHMARKS');
  console.log('===============================================================\n');

  // Initialize DB & Redis
  initDatabase();
  const redis = await createRedisClient();

  // -----------------------------------------------------------------
  // STAGE 1: IN-DATABASE OPTIMIZATION (INDEXING & DENORMALIZATION)
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 STAGE 1: IN-DATABASE OPTIMIZATION (INDEXING & DENORMALIZATION)');
  console.log('===============================================================');
  benchmarkIndexingAndDenormalization();

  // -----------------------------------------------------------------
  // STAGE 2: HORIZONTAL DB SCALING (READ REPLICAS & GTID ROUTING)
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 STAGE 2: HORIZONTAL DB SCALING (READ REPLICAS & GTID ROUTING)');
  console.log('===============================================================');
  
  const replicaCluster = new ReadReplicaCluster();
  const testUserUuid = 'usr_4059';

  console.log('1. User updates bio on Primary Leader DB...');
  const { gtid } = await replicaCluster.writeToLeader(testUserUuid, 'Lead System Design Architect');
  console.log(`   Written to Primary Leader (Write Transaction GTID: ${gtid})`);

  console.log('\n2. Naive Read from Lagging Replica (Exposing Replication Lag Bug)...');
  const naiveRead = await replicaCluster.readNaiveReplica(testUserUuid);
  console.log(`   Served by: [${naiveRead.servedBy}] (Replica GTID: ${naiveRead.gtid})`);

  console.log('\n3. Smart Router Read with GTID Watermark Check...');
  const smartRead = await replicaCluster.readSmartRouter(testUserUuid, gtid);
  console.log(`   Served by: [${smartRead.servedBy}] (Leader Fallback triggered!)`);
  console.log(`   Result: Bio="${smartRead.data.bio}" (Read-Your-Own-Writes Consistency Preserved!)`);

  console.log('\n4. Syncing Replica to GTID and Reading Again...');
  await replicaCluster.syncReplicaToGtid(gtid);
  const caughtUpRead = await replicaCluster.readSmartRouter(testUserUuid, gtid);
  console.log(`   Served by: [${caughtUpRead.servedBy}] (Replica caught up; serving from Replica node)`);

  // -----------------------------------------------------------------
  // STAGE 3: APPLICATION CACHING & CDN EDGE HEADERS
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 STAGE 3: EXTERNAL CACHING & CDN EDGE HEADERS');
  console.log('===============================================================');

  const appCache = new AppCacheAside(redis);

  console.log('1. First Fetch (Cache Miss -> DB Replica)...');
  const missRes = await appCache.getUserFeed('usr_4059');
  console.log(`   Source: [${missRes.source}], Latency: ${missRes.latencyMs.toFixed(3)} ms`);

  console.log('2. Second Fetch (Cache Hit -> Redis RAM)...');
  const hitRes = await appCache.getUserFeed('usr_4059');
  console.log(`   Source: [${hitRes.source}], Latency: ${hitRes.latencyMs.toFixed(3)} ms`);

  console.log('\n3. Generated CDN Edge Cache-Control Headers:');
  console.table(appCache.getCdnHeaders(60, 300));

  // -----------------------------------------------------------------
  // STAGE 4: ADVANCED CONCURRENCY & DEEP-DIVE EDGE CASES
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 STAGE 4: ADVANCED DEEP DIVES (SINGLEFLIGHT, VERSIONING, XFETCH)');
  console.log('===============================================================');

  // SingleFlight
  console.log('\n--- 4A: SingleFlight Request Coalescing ---');
  const sf = new SingleFlight();
  const targetEmail = 'user_4059@example.com';
  const CONCURRENT_REQUESTS = 2500;

  console.log(`⚡ Firing ${CONCURRENT_REQUESTS} concurrent requests for un-cached key: "${targetEmail}"...`);

  const startTime = Date.now();
  const requests = Array.from({ length: CONCURRENT_REQUESTS }, () =>
    sf.do(targetEmail, async () => {
      await new Promise((res) => setTimeout(res, 20));
      return queryUserByEmail(targetEmail);
    })
  );

  const results = await Promise.all(requests);
  const durationMs = Date.now() - startTime;
  const stats = sf.getStats();

  console.table({
    'Total Requests': stats.totalCalls,
    'Deduplicated Calls': stats.deduplicatedCalls,
    'Actual DB Queries Executed': stats.actualFetches,
    'Query Reduction Efficiency': stats.efficiencyPercent,
    'Total Execution Time (ms)': `${durationMs}ms`
  });

  // Atomic Cache Versioning
  console.log('\n--- 4B: Atomic Cache Key Versioning ---');
  const versionedCache = new VersionedCache(redis);
  const versionRes1 = await versionedCache.getUser('usr_100');
  console.log(`   Read 1: Source=[${versionRes1.source}], Version=[v${versionRes1.version}]`);
  
  await versionedCache.updateUser('usr_100', 'Principal Systems Engineer');
  const versionRes2 = await versionedCache.getUser('usr_100');
  console.log(`   Read 2 (Post-Mutation): Source=[${versionRes2.source}], Version=[v${versionRes2.version}], Bio="${versionRes2.data.bio}"`);

  // XFetch
  console.log('\n--- 4C: XFetch Probabilistic Early Refresh ---');
  const xfetch = new XFetchCache(redis);
  let fetchCount = 0;
  const mockCompute = async () => {
    fetchCount++;
    await new Promise((res) => setTimeout(res, 15));
    return { reportId: fetchCount };
  };

  await xfetch.get('analytics:products', 2, 1.0, mockCompute);
  for (let i = 0; i < 10; i++) {
    await new Promise((res) => setTimeout(res, 200));
    await xfetch.get('analytics:products', 2, 1.5, mockCompute);
  }

  console.table({
    'Total Cache Hits': xfetch.totalHits,
    'Early Background Refreshes': xfetch.backgroundRefreshes,
    'Total Compute Runs': fetchCount
  });

  // Key Fanout
  console.log('\n--- 4D: Hot Key Fanout (Salting Shards) ---');
  const fanout = new KeyFanoutCache(redis, 5);
  await fanout.setHotKey('celebrity:taylor', { post: 'Hello World' }, 300);
  
  const shardDistribution: Record<string, number> = {};
  for (let i = 0; i < 10; i++) {
    const res = await fanout.getHotKey('celebrity:taylor');
    if (res) {
      shardDistribution[res.shardUsed] = (shardDistribution[res.shardUsed] || 0) + 1;
    }
  }
  console.table(shardDistribution);

  console.log('\n===============================================================');
  console.log('🎉 ALL STAGES & PATTERNS BENCHMARKED SUCCESSFULLY!');
  console.log('===============================================================\n');

  await redis.quit();
  process.exit(0);
}

runAllReadScalingBenchmarks().catch((err) => {
  console.error('❌ Benchmark Error:', err);
  process.exit(1);
});
