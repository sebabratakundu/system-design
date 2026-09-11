# Insurance Management System — High-Level Design (HLD) Map

## Destination

A comprehensive, production-grade High-Level Design (HLD) architecture specification for a scalable, fault-tolerant, and highly available Insurance Management System (IMS), covering system topology, data consistency, distributed workflows/sagas, scalability bottlenecks, multi-region availability, and fault recovery across Quoting, Policy Lifecycle, Billing/Ledger, and Claims/FNOL.

## Notes

- **Domain**: Multi-Line Insurance Management System (IMS)
- **Focus**: High-Level Design (HLD) architecture specification and diagrams
- **Skills to consult**: `/grilling`, `/domain-modeling`
- **Standing preferences**: Strict financial auditability (double-entry bookkeeping), zero data loss guarantees for ledger and policy contracts, decoupled event-driven bounded contexts, high resilience against catastrophe claim surges.

## Decisions so far

- [Issue 01: Core Service Boundaries & Communication Topology](./issues/01-core-service-boundaries-and-topology.md) — 5 bounded contexts with persona BFFs, synchronous gRPC for reads/rating, and async Kafka with Transactional Outbox + CDC for mutations.
- [Issue 02: Storage Architecture & Data Consistency](./issues/02-storage-architecture-and-data-consistency.md) — Polyglot persistence (Redis for rating, PostgreSQL with bi-temporal versioning for policies, append-only double-entry ledger for billing, S3 for claim evidence).
- [Issue 03: Distributed Sagas & Workflow Orchestration](./issues/03-distributed-sagas-and-workflow-orchestration.md) — Orchestrator-driven sagas (Temporal-style) for Policy Issuance, Endorsements, and Claims Lifecycle with explicit forward-recovery and reversal compensations.
- [Issue 04: High Availability & Multi-Region Disaster Recovery](./issues/04-high-availability-and-multi-region-disaster-recovery.md) — Tiered Multi-Region setup (Active-Active for stateless quoting, Primary-Standby with Multi-AZ sync replication for policy/ledger writes, RPO=0 / RTO<30s).
- [Issue 05: Scalability & High-Contention Traffic Handling](./issues/05-scalability-and-high-contention-traffic-handling.md) — Singleflight request coalescing for 50k+ QPS quoting, asynchronous Kafka queue buffer for disaster FNOL claim spikes, and horizontal DB sharding on account_id.
- [Issue 06: Fault Tolerance, Idempotency & Failure Recovery](./issues/06-fault-tolerance-idempotency-and-failure-recovery.md) — Zero-data-loss Transactional Outbox + Debezium CDC, two-tier Redis + PostgreSQL idempotency keys, circuit breakers, and Dead-Letter Queue (DLQ) retry ladders.

## Not yet specified

- **Actuarial Lakehouse & Data Warehouse Integration**: Bulk data streaming (CDC/Debezium) to Delta Lake / Snowflake for historical loss ratio modeling and pricing adjustments.
- **Automated Disaster Recovery Runbooks**: Active-Active partition split handling and cross-region consensus drift remediation.
- **Third-Party Partner Ecosystem**: Async webhook and API aggregator topology for vehicle telematics, DMV/MVR records, and electronic payment gateways.

## Out of scope

- Low-Level Design (LLD) concrete class diagrams and TypeScript code implementations (postponed to a separate LLD map).
- Deep ML training pipelines for fraud prediction (abstracted behind a clean synchronous/asynchronous Fraud Risk Scoring Hook).
- Multi-tier agent/broker hierarchical commission engines.
