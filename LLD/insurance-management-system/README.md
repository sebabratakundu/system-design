# Insurance Management System (IMS) — Low-Level Design (LLD)

Production-grade Low-Level Design (LLD) architecture, Class Diagrams, and runnable TypeScript implementation for an enterprise multi-line Insurance Management System.

---

## 📚 Documentation & Diagrams

- **Class Diagrams & Pattern Specifications**: [class_diagram.md](./class_diagram.md)
- **High-Level Design (HLD) Architecture Guide**: [../../HLD/insurance-management-system/insurance_management_system_hld.md](../../HLD/insurance-management-system/insurance_management_system_hld.md)
- **Production PostgreSQL Database Schema**: [../../HLD/insurance-management-system/database_schema.md](../../HLD/insurance-management-system/database_schema.md)
- **Domain Glossary (Ubiquitous Language)**: [../../CONTEXT.md](../../CONTEXT.md)

---

## 🛠️ Architecture & Design Patterns Implemented

1. **State Pattern** (`src/patterns/state/`): Finite State Machine enforcing legal policy transitions (`Draft` $\to$ `PendingPayment` $\to$ `Active` $\to$ `Endorsed` $\to$ `Cancelled` $\to$ `Lapsed`).
2. **Strategy Pattern** (`src/patterns/strategy/`): Extensible actuarial rating pipelines (`AutoRatingPipeline`, `PropertyRatingPipeline`) with LRU caching.
3. **Double-Entry General Ledger** (`src/patterns/ledger/`): Enforces immutable balanced debits/credits ($\sum \text{Debits} == \sum \text{Credits}$) across cash, receivables, unearned premiums, and loss reserves.
4. **Saga Orchestrator** (`src/patterns/saga/`): Coordinates multi-step distributed checkout and claims settlement with automated LIFO compensation (refunds and reversal ledger entries).
5. **Transactional Outbox & CDC** (`src/patterns/events/`): Atomically records domain events with zero dual-write vulnerabilities.
6. **Bi-Temporal Policy Versioning** (`src/models/PolicyVersion.ts`): Reconstructs exact coverage in effect at any historical Date-of-Loss.

---

## 🚀 Running the Reference Implementation

```bash
# Install dependencies
pnpm install

# Run the simulation
pnpm dev
```
