# Issue 04: High Availability & Multi-Region Disaster Recovery

Status: CLOSED
Labels: wayfinder:grilling
Assignee: antigravity
Blocked by: none

## Question

What is the global deployment topology (Active-Active vs. Active-Passive), Anycast/DNS traffic routing, cross-region asynchronous vs synchronous data replication strategies, and disaster recovery SLA targets (RPO = 0 for Financial Ledger, RTO < 1 minute)?

## Resolution

The system implements a **Tiered Multi-Region Architecture**: Global Active-Active for stateless/read-heavy quoting and customer browsing, combined with Active-Passive Primary/Standby with Region-Affinity for mutating policy state and financial ledger transactions:

1. **Global Traffic Ingress & Anycast Routing**:
   - **Global Anycast DNS & Edge Network (Cloudflare / AWS Route53)**: Routes customer, broker, and aggregator traffic to the topologically closest healthy cloud region via geo-proximity latency routing with sub-second health probing.
   - **Product & Rating Engine (Active-Active)**: Deployed across all active regions concurrently; evaluations run against local in-memory Redis cluster rate matrices without cross-region WAN round trips.

2. **Transactional Core Deployment (Active-Passive with Cell Affinity)**:
   - **Policy Lifecycle & Billing/Ledger Services**: Run with a designated Primary Region (Leader) handling all mutating transactions, while the Standby Region hosts live warm replicas.
   - **Zero Split-Brain Guarantee**: Prevents distributed multi-master split-brain reconciliation errors on financial accounts and policy state machines.

3. **Disaster Recovery Targets & Data Replication**:
   - **Financial Ledger & Policy Contracts**:
     - $\text{RPO} = 0$: Multi-AZ synchronous PostgreSQL WAL replication in the primary region ensures zero committed transaction loss.
     - $\text{RTO} < 30\text{ seconds}$: Automated Patroni / Raft quorum failover for intra-region AZ failures; $\text{RTO} < 2\text{ minutes}$ for catastrophic full-region disaster recovery via automated DNS switch and standby DB promotion.
   - **Quoting & Search Read Replicas**:
     - $\text{RPO} < 5\text{ seconds}$, $\text{RTO} < 10\text{ seconds}$ via asynchronous cross-region streaming replication.

4. **Cross-Region Infrastructure Synchronization**:
   - **Kafka MirrorMaker 2 / Cluster Linking**: Asynchronously replicates events from Primary to Standby Kafka clusters with active consumer offset synchronization.
   - **S3 Cross-Region Replication (CRR)**: Asynchronously mirrors policy PDFs, COIs, and claim evidence attachments across regions.

### Multi-Region High Availability Diagram

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
