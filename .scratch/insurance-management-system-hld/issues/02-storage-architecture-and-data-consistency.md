# Issue 02: Storage Architecture & Data Consistency

Status: CLOSED
Labels: wayfinder:grilling
Assignee: antigravity
Blocked by: none

## Question

What database engines, storage paradigms (ACID relational vs. Event Store vs. Document/Blob), data consistency models (strict transactional consistency for Ledger vs. eventual consistency for search/analytics), and schema isolation boundaries are required for each bounded context (Rating, Policy, Billing, Claims)?

## Resolution

The storage architecture implements a polyglot persistence model adhering to the database-per-service pattern, balancing local ACID guarantees with cross-service eventual consistency:

1. **Storage Technology per Bounded Context**:
   - **Product & Rating Service**: Master rating algorithms and product catalog in **PostgreSQL**; active rate matrices, actuarial multipliers, and underwriting risk rules compiled into **Redis Cluster** for $<2\text{ms}$ quoting latency.
   - **Policy Lifecycle Service**: **PostgreSQL** utilizing a bi-temporal `policy_versions` table with JSONB coverage trees and an immutable `policy_events` audit table.
   - **Billing & Double-Entry Ledger Service**: **PostgreSQL** with `SERIALIZABLE` isolation level, enforcing an immutable append-only general ledger structure with strict database check constraints requiring $\sum \text{Debits} - \sum \text{Credits} = 0$.
   - **Claims Management & FNOL Service**: **PostgreSQL** for relational claim records, loss reserves, adjuster assignments, and status transitions + **S3-compatible Object Storage** for evidence media (photos, police reports, receipts).
   - **Search & Global Projections**: **OpenSearch / Elasticsearch** populated asynchronously via Kafka CDC for sub-second customer policy search and claim queries.

2. **Data Consistency Model**:
   - **Strong Consistency (Local ACID)**: Enforced inside each service's boundary (e.g. policy binding, ledger entries, reserve allocation).
   - **Eventual Consistency (CQRS Projections)**: Enforced across service boundaries via Kafka CDC and idempotent projection handlers.

3. **Bi-Temporal Policy Versioning Architecture**:
   - Every policy endorsement or mid-term adjustment (MTA) inserts an immutable row into `policy_versions` with `[valid_from, valid_to)` (real-world effective period) and `transaction_timestamp` (audit timestamp).
   - Supports instant $O(1)$ coverage queries at the exact timestamp of an accident/loss:
     ```sql
     SELECT * FROM policy_versions 
     WHERE policy_id = :policyId 
       AND :dateOfLoss >= valid_from 
       AND :dateOfLoss < valid_to;
     ```

4. **Double-Entry Ledger Data Schema**:
   - `accounts`: Represents Chart of Accounts (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`).
   - `journal_entries`: Represents an atomic financial event (`PREMIUM_CAPTURED`, `LOSS_RESERVE_ESTABLISHED`, `CLAIM_PAYOUT_SETTLED`).
   - `journal_lines`: Append-only debit and credit entries; zero modifications or deletes allowed. Reversals are made strictly via offsetting journal entries.

### Double-Entry Ledger Balance Diagram

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
