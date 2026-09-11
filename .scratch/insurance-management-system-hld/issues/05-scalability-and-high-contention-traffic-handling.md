# Issue 05: Scalability & High-Contention Traffic Handling

Status: CLOSED
Labels: wayfinder:grilling
Assignee: antigravity
Blocked by: none

## Question

How does the architecture scale to support high-throughput quoting spikes (50k+ quotes/min), bursty catastrophe FNOL claim ingestion surges, database sharding/partitioning keys, and multi-tier caching (Redis, Local memory, CDN)?

## Resolution

The architecture solves high-contention traffic surges and write-scaling bottlenecks using queue-centric buffering, request coalescing, multi-tier caching, and database partitioning:

1. **Quoting Surge & Aggregator Traffic Scaling ($50\text{k}+ \text{QPS}$)**:
   - **Horizontal Pod Autoscaling (HPA)**: Product & Rating worker pods scale dynamically based on CPU/request rate.
   - **Singleflight Request Coalescing**: Duplicate concurrent quote inquiries with identical risk attributes share a single in-flight computation rather than performing redundant matrix multiplications.
   - **Multi-Level Cache**: Local in-memory LRU cache for static base rate tables + Redis Cluster for compiled dynamic rating trees and actuarial multipliers.

2. **Catastrophe FNOL Ingestion Surge ($500\text{k}+ \text{Claims/Day}$)**:
   - **Queue-Centric Ingestion Buffer**: The Claims Ingress API validates the basic schema and appends raw claim filings into Kafka topic `claims.fnol.ingest`, immediately returning `202 Accepted` with a tracking ID in $<20\text{ms}$.
   - **Direct-to-S3 Evidence Upload**: Media evidence (damage photos, police reports, dashcam videos) is uploaded directly from client devices to S3 via pre-signed URLs, offloading multi-megabyte I/O from backend application servers.
   - **Controlled Micro-Batch Processing**: Worker pools consume from Kafka in batches, applying backpressure and throttling database write transactions to stay within PostgreSQL connection and IOPS limits.

3. **Database Sharding & Table Partitioning**:
   - **Horizontal Sharding Key**: Databases are horizontally sharded on `account_id` / `policyholder_id` via consistent hashing. Policies, customer profiles, and claims for a given policyholder collocate on the same shard for localized transactional integrity.
   - **Temporal Partitioning**: PostgreSQL tables `journal_entries` and `journal_lines` are range-partitioned monthly by `created_at`. Inactive historical partitions are transitioned to cold storage tablespaces.
   - **Policy Versions Partitioning**: `policy_versions` is partitioned by `line_of_business` and `valid_from` ranges.

### Catastrophe FNOL Surge Buffering Pipeline

```
[ 100,000+ Policyholders / App Users ]
                  │
                  ├── Direct Evidence Upload ──► [ S3 Pre-Signed Storage ]
                  │
                  ▼
   [ Fast Ingress API Gateway ] ── (202 Accepted in <20ms)
                  │
                  ▼
   [ Kafka Topic: claims.fnol.ingest (Buffer) ]
                  │
                  ▼ (Controlled Micro-Batch Consumption)
   [ Claims Batch Ingestion Workers ]
                  │
                  ▼
   [ PostgreSQL Sharded DB (Relational DB & Reserve Creation) ]
```
