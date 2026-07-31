import { LRUCache } from 'lru-cache';

/**
 * PATTERN 3: Handling Bursts with Queues & Intelligent Load Shedding
 * 
 * Demonstrates:
 * 1. Asynchronous Write Queue Buffer (Decoupling write acceptance from DB processing rate)
 * 2. Intelligent Telemetry Load Shedder (Strava/Uber Location Sampling Engine)
 */

export interface WriteTask {
  id: string;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
}

/**
 * Asynchronous Write Queue Buffer
 */
export class WriteQueueBuffer {
  private queue: WriteTask[] = [];
  private maxQueueSize: number;
  private processedCount: number = 0;
  private droppedCount: number = 0;
  private isProcessing: boolean = false;
  private maxProcessingRatePerSec: number;

  constructor(maxQueueSize: number = 500, maxProcessingRatePerSec: number = 200) {
    this.maxQueueSize = maxQueueSize;
    this.maxProcessingRatePerSec = maxProcessingRatePerSec;
  }

  public enqueue(task: WriteTask): { accepted: boolean; queueLength: number; status: string } {
    if (this.queue.length >= this.maxQueueSize) {
      this.droppedCount++;
      return { accepted: false, queueLength: this.queue.length, status: 'REJECTED_QUEUE_FULL' };
    }
    this.queue.push(task);
    return { accepted: true, queueLength: this.queue.length, status: 'QUEUED' };
  }

  public async drainQueue(onProcess: (tasks: WriteTask[]) => Promise<void>): Promise<{ processed: number; remaining: number }> {
    if (this.isProcessing) return { processed: 0, remaining: this.queue.length };
    this.isProcessing = true;

    const batchSize = Math.min(this.queue.length, Math.ceil(this.maxProcessingRatePerSec / 10)); // 100ms batch
    const batch = this.queue.splice(0, batchSize);

    if (batch.length > 0) {
      await onProcess(batch);
      this.processedCount += batch.length;
    }

    this.isProcessing = false;
    return { processed: batch.length, remaining: this.queue.length };
  }

  public getStats() {
    return {
      currentQueueLength: this.queue.length,
      processedCount: this.processedCount,
      droppedCount: this.droppedCount,
    };
  }
}

export interface GpsLocationUpdate {
  userId: string;
  latitude: number;
  longitude: number;
  speedMs: number;
  timestamp: number;
  isTripEnd?: boolean;
}

/**
 * Intelligent Location Update Sampler / Load Shedder
 */
export class LocationLoadShedder {
  private lastUpdateCache: LRUCache<string, number>;
  private minIntervalMs: number;
  public totalIncoming: number = 0;
  public totalAccepted: number = 0;
  public totalShedded: number = 0;

  constructor(minIntervalMs: number = 2000) {
    this.minIntervalMs = minIntervalMs;
    this.lastUpdateCache = new LRUCache<string, number>({
      max: 100000, // Track up to 100k active users
      ttl: 60000,
    });
  }

  public evaluateUpdate(update: GpsLocationUpdate): { accept: boolean; reason: string } {
    this.totalIncoming++;

    // Mandatory critical updates bypass load shedding
    if (update.isTripEnd) {
      this.totalAccepted++;
      this.lastUpdateCache.set(update.userId, update.timestamp);
      return { accept: true, reason: 'CRITICAL_TRIP_END' };
    }

    const lastTime = this.lastUpdateCache.get(update.userId);
    const now = update.timestamp;

    if (lastTime && now - lastTime < this.minIntervalMs) {
      this.totalShedded++;
      return {
        accept: false,
        reason: `SHEDDED_TOO_FRESH (${now - lastTime}ms < ${this.minIntervalMs}ms threshold)`,
      };
    }

    this.totalAccepted++;
    this.lastUpdateCache.set(update.userId, now);
    return { accept: true, reason: 'ACCEPTED_FRESH_UPDATE' };
  }
}

export async function runQueuesAndLoadSheddingDemo() {
  console.log(`\n===============================================================`);
  console.log(`🚀 PATTERN 3: ASYNCHRONOUS WRITE QUEUES & LOAD SHEDDING DEMO`);
  console.log(`===============================================================\n`);

  // 1. Asynchronous Write Queue Buffering Demo
  console.log(`--- 1. WRITE QUEUE BUFFERING & BURST ABSORPTION ---`);
  const queueBuffer = new WriteQueueBuffer(100, 50); // Max queue 100, process 50/sec rate
  const BURST_COUNT = 120;

  console.log(`⚡ Simulating a burst of ${BURST_COUNT} write events targeting write buffer (capacity: 100)...`);
  for (let i = 1; i <= BURST_COUNT; i++) {
    const res = queueBuffer.enqueue({
      id: `task_${i}`,
      type: 'ORDER_UPDATE',
      payload: { orderId: 4000 + i, status: 'PROCESSING' },
      timestamp: Date.now(),
    });
    if (i % 30 === 0 || !res.accepted) {
      console.log(`  Enqueue Event #${i}: Status=[${res.status}], Queue Length=[${res.queueLength}]`);
    }
  }

  const initialStats = queueBuffer.getStats();
  console.log(`  Buffer Summary: Queued=${initialStats.currentQueueLength}, Rejected/Shedded=${initialStats.droppedCount}`);

  console.log(`\n  Draining Write Buffer at controlled database ingest rate...`);
  while (queueBuffer.getStats().currentQueueLength > 0) {
    const drainRes = await queueBuffer.drainQueue(async (batch) => {
      // Simulate DB write latency for batch
      await new Promise((res) => setTimeout(res, 10));
    });
    console.log(`  Processed batch of ${drainRes.processed} tasks. Queue remaining: ${drainRes.remaining}`);
  }

  // 2. Intelligent Telemetry Load Shedder Demo
  console.log(`\n--- 2. INTELLIGENT TELEMETRY LOAD SHEDDER (GPS TELEMETRY) ---`);
  const shedder = new LocationLoadShedder(2000); // 2000ms minimum window between updates
  const testUserId = 'driver_8801';
  let currentTime = Date.now();

  const telemetrySequence: GpsLocationUpdate[] = [
    { userId: testUserId, latitude: 37.7749, longitude: -122.4194, speedMs: 12.5, timestamp: currentTime },
    { userId: testUserId, latitude: 37.7750, longitude: -122.4195, speedMs: 12.6, timestamp: currentTime + 400 },   // +400ms (too fast)
    { userId: testUserId, latitude: 37.7752, longitude: -122.4197, speedMs: 12.8, timestamp: currentTime + 1100 },  // +1100ms (too fast)
    { userId: testUserId, latitude: 37.7758, longitude: -122.4201, speedMs: 13.1, timestamp: currentTime + 2200 },  // +2200ms (ACCEPTED)
    { userId: testUserId, latitude: 37.7760, longitude: -122.4203, speedMs: 13.2, timestamp: currentTime + 2500 },  // +300ms (too fast)
    { userId: testUserId, latitude: 37.7765, longitude: -122.4208, speedMs: 0.0,  timestamp: currentTime + 2800, isTripEnd: true }, // TRIP END (CRITICAL)
  ];

  console.log(`  Processing incoming GPS telemetry update stream for user "${testUserId}":`);
  for (const update of telemetrySequence) {
    const res = shedder.evaluateUpdate(update);
    const deltaMs = update.timestamp - currentTime;
    const statusIcon = res.accept ? '🟢 ACCEPTED' : '🔴 SHEDDED';
    console.log(`    Time +${deltaMs.toString().padStart(4, ' ')}ms | Update: [${statusIcon}] -> Reason: ${res.reason}`);
  }

  const shedPercentage = ((shedder.totalShedded / shedder.totalIncoming) * 100).toFixed(1);
  console.log(`\n  📊 LOAD SHEDDING SUMMARY: Total=${shedder.totalIncoming}, Accepted=${shedder.totalAccepted}, Shedded=${shedder.totalShedded} (${shedPercentage}% reduction in DB write traffic!)`);
}

if (process.argv[1] && process.argv[1].endsWith('3-write-queues-load-shedding.ts')) {
  runQueuesAndLoadSheddingDemo();
}
