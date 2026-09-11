# Issue 01: Core Service Boundaries & Communication Topology

Status: CLOSED
Labels: wayfinder:grilling
Assignee: antigravity
Blocked by: none

## Question

What are the exact bounded context service boundaries, API Gateway routing topologies, synchronous (gRPC/REST) vs. asynchronous (Kafka event streams) communication boundaries, and outbox/CDC integration contracts across the Insurance Management System (Product/Rating, Policy Lifecycle, Billing & Ledger, Claims Management)?

## Resolution

The system architecture is structured into 5 decoupled bounded contexts fronted by an API Gateway with persona-based Backend-for-Frontend (BFF) layers, communicating via synchronous gRPC for low-latency queries and asynchronous Apache Kafka with Transactional Outbox + CDC for mutating state transitions:

1. **Ingress & Gateway Architecture**:
   - **Edge API Gateway (Envoy / Kong)**: Terminates TLS, enforces global rate limiting, verifies OAuth2/JWT tokens, and inspects WAF rules.
   - **Persona BFFs**: Dedicated BFF services for `Customer-BFF`, `Broker-Portal-BFF`, and `Partner-B2B-Gateway` to format client-specific DTOs and handle auth translation.

2. **Core Service Boundaries**:
   - **Product & Rating Service**: Stateless actuarial computation engine, dynamic risk formula evaluation, and instant quote generation.
   - **Policy Lifecycle Service**: Manages Policy aggregate root, state machine transitions (Draft $\to$ Quoted $\to$ Bound $\to$ Active $\to$ Cancelled/Expired), mid-term endorsements (MTAs), and renewals.
   - **Billing & Double-Entry Ledger Service**: Invoice schedules, payment gateway integrations, dunning state machines, and double-entry financial ledger (Debits/Credits for premiums, unearned reserves, and receivables).
   - **Claims Management & FNOL Service**: First Notice of Loss intake, date-of-loss policy coverage validation, loss reserve calculations, adjuster assignment, and settlement adjudication.
   - **Document & Notification Service**: Async PDF generation (binders, COIs, schedules, denial letters) and multi-channel notifications (Email/SMS/Push).

3. **Synchronous vs. Asynchronous Communication Matrix**:
   - **Synchronous gRPC / REST**: Reserved strictly for read-only queries and real-time rating calculations (e.g. FNOL date-of-loss coverage check, quote price calculation).
   - **Asynchronous Apache Kafka**: Used for all cross-service state transitions (`QuoteBound`, `PolicyIssued`, `PolicyEndorsed`, `InvoiceGenerated`, `PaymentCaptured`, `ClaimFiled`, `LossReserveAllocated`, `ClaimSettled`).
   - **Zero Dual-Write Contract**: All mutating domain services write state and outbox events in a single ACID database transaction. Debezium CDC captures outbox records and reliably streams them to Kafka.

4. **Event Partitioning & Ordering**:
   - Kafka topics (`policy.events`, `claims.events`, `billing.events`) are partitioned strictly by `policy_id` (or `account_id` for ledger), guaranteeing strict in-order processing per entity while scaling horizontally across partitions.

### Topology Diagram

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
