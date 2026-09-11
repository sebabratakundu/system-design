# Issue 06: Fault Tolerance, Idempotency & Failure Recovery

Status: CLOSED
Labels: wayfinder:grilling
Assignee: antigravity
Blocked by: none

## Question

How are zero-data-loss guarantees enforced using Transactional Outbox with Change Data Capture (CDC / Debezium), distributed idempotency keys for payment and claim disbursements, circuit breakers (Resilience4j / Envoy), rate limiting, and Dead-Letter Queue (DLQ) automated retry policies?

## Resolution

The system enforces end-to-end fault tolerance, zero-data-loss event streaming, distributed idempotency, and cascading failure protection:

1. **Transactional Outbox & CDC Pattern (Zero Dual-Write Race Conditions)**:
   - Every mutating business action (e.g. policy binding, premium charging, loss reserve adjustment) writes domain state and corresponding event records into an `outbox_events` table within a single atomic PostgreSQL ACID transaction.
   - Debezium CDC captures outbox records directly from the database Write-Ahead Log (WAL) and streams them to Apache Kafka with guaranteed at-least-once delivery, eliminating application dual-write failure vulnerabilities.

2. **Distributed Financial Idempotency Protocol**:
   - Mutating payment and payout endpoints require an `Idempotency-Key: <UUID>` header.
   - **Two-Tier Validation**:
     1. Acquires a short-lived distributed mutex lock in Redis (`SET lock:idemp:<key> NX EX 10`).
     2. Checks the PostgreSQL `idempotency_keys` table. If status is `COMPLETED`, returns the cached HTTP response and payload immediately without re-executing logic. If `PENDING`, rejects concurrent duplicate requests with `409 Conflict`.
     3. Executes the business transaction and inserts the completed idempotency record within the same database transaction.
     4. Releases the Redis mutex lock.

3. **Cascading Failure Protection & Bulkheading**:
   - **Circuit Breakers (Envoy / Resilience4j)**: External integrations (DMV/MVR records, credit scoring agencies, electronic bank rails) run behind circuit breakers that fail fast upon $50\%$ error rate thresholds over a 10s window.
   - **Bulkhead Thread/Connection Pools**: External third-party lookups run in dedicated, isolated thread pools so slow upstream API latencies never exhaust thread pools serving critical policy issuance or claim intake.
   - **API Gateway Rate Limiting**: Token-bucket rate limiters at the edge protect internal microservices from partner API scraping and abusive traffic.

4. **Retry Ladder & Dead-Letter Queue (DLQ) Topology**:
   - **Retry Topic Ladder**: Consumers utilize non-blocking retry topics with exponential backoff and jitter (`events.retry-1s` $\to$ `events.retry-5s` $\to$ `events.retry-30s`).
   - **Dead-Letter Queue (DLQ)**: Poison messages exceeding 4 retry attempts are routed to `events.dlq` alongside error metadata (exception stack trace, retry count, timestamp), triggering alerts to on-call engineering.
   - **DLQ Replay Admin Tool**: Enables operations to inspect payload errors and replay corrected messages back to the primary topic.

### Transactional Outbox + CDC & Idempotency Pipeline

```
                                  [ ACID Transaction Boundary ]
                       ┌──────────────────────────────────────────────────┐
                       │                                                  │
[ Client Request ] ──► │  1. Check/Insert Idempotency Key (PostgreSQL)    │
(With Idempotency-Key) │  2. Insert/Update Domain Entity (e.g., Policy)   │
                       │  3. Insert Event into outbox_events table        │
                       │                                                  │
                       └─────────────────────────┬────────────────────────┘
                                                 │
                                                 ▼ (PostgreSQL WAL Engine)
                                       [ Debezium CDC Engine ]
                                                 │
                                                 ▼ (Guaranteed At-Least-Once)
                                     [ Apache Kafka Event Bus ]
                                                 │
                                                 ▼
                                     [ Downstream Consumers ]
                                    (With Idempotent Handlers)
```
