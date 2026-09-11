# Insurance Management System (IMS): Production-Grade High-Level Design (HLD)

---

## 1. System Overview & Core Requirements

An enterprise-grade Insurance Management System (IMS) manages the complete insurance lifecycle—from dynamic quotation and risk rating, to policy issuance and mid-term adjustments (MTAs), double-entry premium ledgering, and catastrophe claims adjudication (FNOL).

### Key Architectural Characteristics
- **Multi-Line Extensibility**: Generalized core platform supporting Property & Casualty (P&C), Auto, Life, and Health.
- **Strict Financial Integrity**: Zero discrepancies across premium invoicing, unearned premium liabilities, cash collection, and claim loss reserves via immutable double-entry bookkeeping.
- **Bi-Temporal Policy Coverage**: Point-in-time exact coverage reconstruction for historical date-of-loss claims.
- **High Contention & Disaster Surge Scaling**: Handling $50\text{k}+ \text{QPS}$ aggregator quote scraping and $500\text{k}+ \text{claims/day}$ catastrophe surge events without write degradation.
- **Zero-Data-Loss Reliability**: Transactional Outbox + Change Data Capture (CDC), distributed idempotency, and multi-region failover ($\text{RPO} = 0$, $\text{RTO} < 30\text{s}$).

---

## 2. Core Service Boundaries & Communication Topology

The platform is structured into five isolated bounded contexts fronted by an API Gateway with persona-specific Backend-For-Frontend (BFF) layers.

```
[ Web / Mobile Clients ]      [ Broker Portal ]      [ B2B Aggregators / APIs ]
           │                          │                         │
           ▼                          ▼                         ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │           Edge API Gateway (Envoy / Kong)                        │
   │  - TLS Termination    - Rate Limiting    - OAuth2 / JWT Auth     │
   └───────────────┬──────────────────┬─────────────────┬─────────────┘
                   │                  │                 │
                   ▼                  ▼                 ▼
             [ Customer BFF ]   [ Broker BFF ]   [ Partner BFF ]
                   │                  │                 │
      ┌────────────┴──────────────────┴─────────────────┴────────────┐
      │                      Internal gRPC / REST                    │
      ▼                               ▼                              ▼
┌──────────────┐             ┌─────────────────┐           ┌──────────────────┐
│ Product &    │             │ Policy          │           │ Claims &         │
│ Rating Svc   │             │ Lifecycle Svc   │           │ FNOL Svc         │
│ (Stateless)  │             │ (State Machine) │           │ (Workflow)       │
└──────────────┘             └────────┬────────┘           └────────┬─────────┘
                                      │ (Outbox)                    │ (Outbox)
                                      ▼                             ▼
   ─────────────────────────── [ Apache Kafka Event Bus ] ───────────────────────────
                                      ▲                             ▲
                                      │ (Outbox)                    │ (Consumer)
                             ┌────────┴────────┐           ┌────────┴─────────┐
                             │ Billing &       │           │ Document &       │
                             │ Ledger Svc      │           │ Notification Svc │
                             │ (Double-Entry)  │           │ (Async PDF / Msg)│
                             └─────────────────┘           └──────────────────┘
```

### Bounded Context Responsibilities
1. **Product & Dynamic Rating Service**: Stateless actuarial computation engine. Evaluates risk multiplier matrices, underwriting eligibility rules, and generates real-time quotes.
2. **Policy Lifecycle Service**: Manages the Policy aggregate root, state machine (`Draft` $\to$ `Quoted` $\to$ `Bound` $\to$ `Active` $\to$ `Endorsed` $\to$ `Cancelled` / `Expired`), mid-term adjustments (MTAs), and renewals.
3. **Billing & Double-Entry Ledger Service**: Invoice generation, payment gateway integration, dunning state machines, and general ledger journal transactions.
4. **Claims Management & FNOL Service**: First Notice of Loss intake, date-of-loss coverage verification, adjuster assignments, loss reserve tracking, and settlement adjudication.
5. **Document & Notification Service**: Async PDF generation (policy binders, schedules, certificates of insurance, claim denial letters) and multi-channel notifications (Email/SMS/Push).

### Communication Matrix
- **Synchronous (gRPC / HTTP REST)**: Read-only queries, real-time rate calculations, and sub-second date-of-loss coverage verifications.
- **Asynchronous (Apache Kafka + Transactional Outbox + Debezium CDC)**: All cross-service state transitions (`QuoteBound`, `PolicyIssued`, `PolicyEndorsed`, `PaymentCaptured`, `ClaimFiled`, `LossReserveAllocated`, `ClaimSettled`).
- **Partitioning Strategy**: Kafka topics (`policy.events`, `claims.events`, `billing.events`) are partitioned strictly by `policy_id` (or `account_id` for ledger), guaranteeing strict sequential processing per entity while scaling horizontally.

---

## 3. Storage Architecture & Data Consistency Models

The platform adopts polyglot persistence under the database-per-service pattern, balancing local ACID guarantees with cross-service eventual consistency.

| Service | Primary Storage | Secondary / Cache | Consistency Model | Data Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **Product & Rating** | PostgreSQL (Master Rules) | Redis Cluster (In-Memory) | Read-Heavy Eventual | Compiled Actuarial Decision Trees |
| **Policy Lifecycle** | PostgreSQL | OpenSearch (Projections) | Local ACID / CQRS Read | Bi-Temporal `policy_versions` |
| **Billing & Ledger** | PostgreSQL (`SERIALIZABLE`) | Redis (Distributed Locks) | Strict Financial ACID | Append-Only Double-Entry Ledger |
| **Claims & FNOL** | PostgreSQL | S3-Compatible Object Store | Local ACID / Eventual | Claims Metadata + Evidence Blobs |
| **Document/Notify** | PostgreSQL / MongoDB | S3 Bucket (PDF Storage) | Eventual Consistency | Generated Documents & Audit Log |

### 3.1 Bi-Temporal Policy Versioning
To evaluate coverage at the exact second an accident occurred (even when endorsements are filed retroactively or post-dated), policies use bi-temporal storage:
```sql
CREATE TABLE policy_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL,
    version_number INT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,      -- Real-world coverage start
    valid_to TIMESTAMPTZ NOT NULL,        -- Real-world coverage end
    transaction_time TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), -- DB audit timestamp
    coverage_tree JSONB NOT NULL,
    premium_annual_cents BIGINT NOT NULL,
    CONSTRAINT uq_policy_version UNIQUE (policy_id, version_number)
);

CREATE INDEX idx_policy_temporal_lookup ON policy_versions (policy_id, valid_from, valid_to);
```

### 3.2 Immutable Double-Entry Ledger Schema
Every financial action records balanced debit and credit lines:
```
       ┌────────────────────────────────────────────────────────┐
       │             Journal Entry (Transaction)                │
       └───────────────────────────┬────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌──────────────────────┐                  ┌──────────────────────┐
   │ Journal Line (Debit) │                  │ Journal Line (Credit)│
   │ Account: Cash (Asset)│                  │ Account: Receivables │
   │ Amount: $1,200       │                  │ Amount: $1,200       │
   └──────────────────────┘                  └──────────────────────┘
              ▲                                         ▲
              └─────────────── [ Balance = $0 ] ────────┘
```

```sql
CREATE TABLE journal_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(50) NOT NULL, -- PREMIUM_CAPTURED, LOSS_RESERVE, SETTLEMENT_PAYOUT
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE journal_lines (
    line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES journal_entries(entry_id),
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0)
);
```

---

## 4. Distributed Workflows & Saga Orchestration

Complex multi-step processes are coordinated via an **Orchestration-Driven Saga** (Temporal / Cadence engine) rather than choreographed events to ensure deterministic state tracking, durable timers, and explicit compensating reversals.

### Policy Issuance Saga Sequence
```
Client             Orchestrator           Policy Svc          Billing Svc         Ledger/Gateway      Doc Svc
  │                     │                     │                    │                    │            │
  ├── Submit Checkout ─►│                     │                    │                    │            │
  │                     ├── 1. CreateDraft ──►│                    │                    │            │
  │                     │◄── DraftCreated ────┤                    │                    │            │
  │                     │                                          │                    │            │
  │                     ├── 2. CapturePayment ────────────────────►│                    │            │
  │                     │                                          ├── Auth & Charge ──►│            │
  │                     │                                          │◄── Charge Success ─┤            │
  │                     │                                          ├── Book Ledger ────►│            │
  │                     │◄── PaymentConfirmed ─────────────────────┤                    │            │
  │                     │                                                                            │
  │                     ├── 3. ActivatePolicy ────────────────────►│                                 │
  │                     │◄── PolicyActive (Version 1) ─────────────┤                                 │
  │                     │                                                                            │
  │                     ├── 4. Generate & Send Documents ───────────────────────────────────────────►│
  │◄── Success Response ┤                                                                            │
```

### Workflow Failure & Compensation Matrix
- **Payment Failure**: Transition Policy from `PENDING_PAYMENT` to `PAYMENT_FAILED`.
- **Policy Activation Failure Post-Payment**: Orchestrator triggers Billing Service compensation: issues automated credit card refund and records reversing ledger entries (`Debit: Unearned Premium`, `Credit: Cash`).
- **Claim Denial / Withdrawal**: Automatically releases the previously allocated loss reserve on the ledger (`Debit: Loss Reserves Payable`, `Credit: Claim Loss Expense (Reversal)`).

---

## 5. High Availability & Multi-Region Disaster Recovery

The system utilizes a **Tiered Multi-Region Architecture**: Global Active-Active for stateless quoting and browsing, combined with Active-Passive Primary/Standby with Cell-Affinity for mutating policy state and financial ledger transactions.

```
                              [ Global Anycast DNS (Cloudflare / Route53) ]
                                            │                │
                  ┌─────────────────────────┘                └─────────────────────────┐
                  ▼                                                                    ▼
      ┌───────────────────────┐                                            ┌───────────────────────┐
      │   PRIMARY REGION      │                                            │    STANDBY REGION     │
      │   (e.g., us-east-1)   │                                            │   (e.g., us-west-2)   │
      ├───────────────────────┤                                            ├───────────────────────┤
      │ [ Active Envoy GW ]   │                                            │ [ Active Envoy GW ]   │
      │ [ Rating Svc (Active) │                                            │ [ Rating Svc (Active) │
      │ [ Policy Svc (Leader) │                                            │ [ Policy Svc (Standby)│
      │ [ Ledger Svc (Leader) │                                            │ [ Ledger Svc (Standby)│
      │                       │                                            │                       │
      │  Primary PostgreSQL   │ ─── Async Cross-Region WAL Replication ──► │  Standby PostgreSQL   │
      │  (Multi-AZ Sync Rep)  │                                            │  (Read-Only Replica)  │
      │                       │                                            │                       │
      │  Primary Kafka Cluster│ ───────────── MirrorMaker 2 ─────────────► │  Standby Kafka Cluster│
      │                       │                                            │                       │
      │  S3 Evidence Bucket   │ ────── Cross-Region Replication (CRR) ───► │  S3 Replicated Bucket │
      └───────────────────────┘                                            └───────────────────────┘
```

### Disaster Recovery SLAs
- **Financial Ledger & Policy Contracts**:
  - $\text{RPO} = 0$: Synchronous intra-region Multi-AZ WAL replication ensures zero data loss.
  - $\text{RTO} < 30\text{s}$: Automated Patroni / Raft quorum failover for AZ crashes; $\text{RTO} < 2\text{ minutes}$ for full-region failover via automated DNS cutover and standby replica promotion.
- **Quoting & Search Read Replicas**:
  - $\text{RPO} < 5\text{s}$, $\text{RTO} < 10\text{s}$ via asynchronous replication.

---

## 6. Scalability & High-Contention Traffic Handling

To survive extreme load spikes (e.g. 50k+ QPS aggregator scraping and 500k+ claims/day post-catastrophe):

### 6.1 Catastrophe FNOL Queue-Centric Buffer
Direct database inserts collapse under severe lock and connection contention during natural disaster claim surges. The ingress API decouples intake from processing:

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

### 6.2 Aggregator Quote Surge Mitigation
- **Singleflight Request Coalescing**: Concurrent identical quote requests for the same vehicle/zip/driver risk profile share a single in-flight computation rather than executing redundant matrix multiplications.
- **Multi-Level Caching**: In-memory LRU cache for base rates + Redis Cluster for compiled actuarial decision trees.
- **Horizontal Pod Autoscaler (HPA)**: Rating pods auto-scale based on CPU utilization and request queuing.

### 6.3 Database Sharding & Partitioning
- **Sharding Key**: Databases are sharded by `account_id` / `policyholder_id` via consistent hashing. Policies, customer profiles, and claims for a single policyholder collocate on the same database shard for single-shard ACID transactions.
- **Temporal Table Partitioning**: `journal_entries` and `journal_lines` are partitioned monthly on `created_at`. Inactive historical partitions transition to read-only cold storage tablespaces.

---

## 7. Fault Tolerance, Idempotency & Failure Recovery

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

### 7.1 Zero Dual-Write Eventing (Transactional Outbox + CDC)
Application-level writes to database and message broker simultaneously risk dual-write inconsistencies. The platform writes domain state and event payloads into a local `outbox_events` table in the *same local database transaction*. Debezium CDC tails the database WAL and streams records to Kafka with guaranteed at-least-once delivery.

### 7.2 Two-Tier Distributed Idempotency Protocol
To prevent duplicate premium charges or double claim payouts:
1. Client/Orchestrator submits request with `Idempotency-Key: <UUID>`.
2. Service acquires a short-lived distributed mutex in Redis (`SET lock:idemp:<key> NX EX 10`).
3. Queries PostgreSQL `idempotency_keys` table:
   - If `COMPLETED`: Returns cached HTTP status and response payload immediately.
   - If `PENDING`: Rejects duplicate concurrent request with `409 Conflict`.
4. Executes business transaction and writes completed record within the same ACID transaction.
5. Releases Redis mutex.

### 7.3 Resilience & Dead-Letter Queue (DLQ) Ladders
- **Circuit Breakers & Bulkheads**: External integrations (credit bureaus, DMV lookups, payment gateways) run behind Envoy/Resilience4j circuit breakers ($50\%$ error threshold over 10s window) with isolated worker thread pools.
- **Retry Ladder**: Consumers use retry topics with exponential backoff and jitter (`events.retry-1s` $\to$ `events.retry-5s` $\to$ `events.retry-30s`).
- **Dead-Letter Queue (DLQ)**: Poison messages failing after 4 attempts are routed to `events.dlq` alongside full error stack traces, triggering PagerDuty/Datadog alerts, with an admin replay interface.
