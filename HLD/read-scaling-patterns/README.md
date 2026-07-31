# Production Read Scaling Patterns (TypeScript)

This repository contains fully runnable TypeScript implementations and empirical benchmarks for **all stages of read scaling** built with **`better-sqlite3`**, **`ioredis`**, and **`pnpm`**.

---

## 🛠️ Complete Project & Code Map

```
read-scaling-patterns/
├── package.json
├── tsconfig.json
└── src/
    ├── db/
    │   ├── database.ts                      # SQLite DB with WAL mode, B-tree indexes & 10,000 seeded rows
    │   └── redisClient.ts                   # ioredis client with LRUCache fallback driver
    ├── patterns/
    │   ├── 5-db-indexing-denormalization.ts # STAGE 1: B-Tree Indexing & Strategic Denormalization
    │   ├── 6-read-replicas-routing.ts       # STAGE 2: Read Replicas & GTID Watermark Router
    │   ├── 7-app-cache-aside.ts             # STAGE 3: Redis Cache-Aside & CDN Edge Cache Headers
    │   ├── 1-singleflight.ts                # STAGE 4A: SingleFlight Request Coalescing
    │   ├── 2-cache-versioning.ts             # STAGE 4B: Zero-Race Atomic Cache Versioning
    │   ├── 3-xfetch.ts                      # STAGE 4C: XFetch Probabilistic Early Refresh
    │   └── 4-key-fanout.ts                  # STAGE 4D: Multi-Shard Hot Key Salting
    └── index.ts                             # Complete 7-stage benchmark runner
```

---

## 🚀 Quick Start

```bash
# 1. Install dependencies with pnpm
pnpm install

# 2. Run all 7 stage benchmarks
pnpm start
```

---

## 📊 Complete Benchmark Overview

### 1. STAGE 1: In-Database Optimization (`5-db-indexing-denormalization.ts`)
- **Indexing Benchmark**: B-Tree Index lookup (**0.047 ms**) vs Un-indexed Full Table Scan (**1.317 ms**).
- **Denormalization Benchmark**: Single-table summary lookup vs multi-table runtime JOINs.

### 2. STAGE 2: Horizontal DB Scaling & Read Replicas (`6-read-replicas-routing.ts`)
- **Leader-Follower Router**: Writes go to Primary Leader; reads go to Replicas.
- **GTID Watermark Router**: Automatically detects lagging replicas and falls back to Primary Leader to preserve **Read-Your-Own-Writes consistency**.

### 3. STAGE 3: External Caching & CDN Edge (`7-app-cache-aside.ts`)
- **Redis Cache-Aside**: RAM lookup (**0.840 ms**) vs DB Replica Miss (**3.296 ms**).
- **CDN Edge Headers**: Generates `Cache-Control: public, max-age=60, stale-while-revalidate=300`.

### 4. STAGE 4A: SingleFlight Request Coalescing (`1-singleflight.ts`)
- **Surge Defense**: Coalesces 2,500 concurrent requests into **1 single SQL query** (**99.96% query reduction** in 21ms).

### 5. STAGE 4B: Atomic Cache Key Versioning (`2-cache-versioning.ts`)
- **Zero-Race Invalidation**: Uses `user:{id}:v{version}` keys to eliminate invalidation race conditions during concurrent write mutations.

### 6. STAGE 4C: XFetch Probabilistic Early Refresh (`3-xfetch.ts`)
- **Thundering Herd Defense**: Evaluates $-\beta \cdot \delta \cdot \ln(\text{random}()) > (\text{TTL} - \text{now})$ to refresh keys asynchronously before TTL expiration.

### 7. STAGE 4D: Hot-Key Fanout Salting (`4-key-fanout.ts`)
- **Redis Node Protection**: Pipetrees hot key writes across $K=5$ salted keys (`key:shard_N`) to balance read QPS evenly across Redis cluster nodes.
