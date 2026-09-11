# Issue 03: Distributed Sagas & Workflow Orchestration

Status: CLOSED
Labels: wayfinder:grilling
Assignee: antigravity
Blocked by: none

## Question

How should multi-step distributed workflows be orchestrated across services with full deterministic state, fault tolerance, and compensation mechanisms (specifically: Policy Issuance Saga, Endorsement/MTA Recalculation Saga, and Claims Settlement & Loss Reserve Allocation Saga)?

## Resolution

The system utilizes an **Orchestration-Driven Saga Architecture** (powered by a durable workflow engine like Temporal / Cadence) to guarantee deterministic state tracking, durable execution across long-running pauses, automated timeouts, and compensating reversals across services:

1. **Workflow Engine & Orchestrator Topology**:
   - **Centralized Orchestrator Workers**: Stateful workflow orchestrators maintain durable timers, execution histories, and state transitions in an append-only workflow log.
   - **Forward Recovery with Retries**: Transient failures (e.g. network blips, gateway timeouts) use exponential backoff with jitter before triggering compensation.
   - **Semantic Compensation**: Irreversible external actions (e.g. processed credit card payments) are compensated via explicit business reversal operations (e.g. issuing refunds and posting offsetting ledger entries).

2. **Policy Issuance Saga**:
   - **Step 1 (Bind Quote)**: Locks quoted premium rates with Rating Service.
   - **Step 2 (Create Pending Policy)**: Policy Service creates a record in `PENDING_PAYMENT` state.
   - **Step 3 (Capture Payment)**: Billing Service authorizes and charges the customer payment method via payment gateway.
   - **Step 4 (Ledger Entry)**: Billing Service records double-entry bookkeeping transactions (`Debit: Cash`, `Credit: Unearned Premium`).
   - **Step 5 (Activate Policy)**: Policy Service transitions status to `ACTIVE`, commits `PolicyVersion 1`, and emits `PolicyIssued` event.
   - **Step 6 (Async Document Delivery)**: Document Service renders the PDF Binder / Schedule and dispatches customer notification.
   - *Compensation*: If payment fails, transition policy to `PAYMENT_FAILED`; if activation fails after payment, trigger automatic payment refund and reversing ledger entries (`Debit: Unearned Premium`, `Credit: Cash`).

3. **Endorsement / Mid-Term Adjustment (MTA) Saga**:
   - Evaluates coverage delta with Rating Service $\to$ computes pro-rata premium adjustment.
   - For additional premium: Captures payment $\to$ posts ledger journal $\to$ commits new `PolicyVersion N+1` $\to$ emits `PolicyEndorsed`.
   - For return premium (refund): Posts refund on ledger $\to$ commits new `PolicyVersion N+1` $\to$ emits `PolicyEndorsed`.

4. **Claims Adjudication & Loss Reserve Saga**:
   - **Step 1 (FNOL Ingestion & Coverage Verification)**: Validates policy coverage limits against `policy_versions` at the exact Date-of-Loss via synchronous gRPC read.
   - **Step 2 (Allocate Loss Reserve)**: Requests Billing Ledger to post initial Loss Reserve (`Debit: Claim Loss Expense`, `Credit: Loss Reserves Payable`).
   - **Step 3 (Adjuster Adjudication)**: Pauses for asynchronous adjuster appraisal / approval or auto-adjudication rules.
   - **Step 4 (Settlement Disbursement)**: On approval, Billing Service triggers bank payout (`Debit: Loss Reserves Payable`, `Credit: Cash`).
   - **Step 5 (Claim Closure)**: Claims Service marks claim `SETTLED` / `CLOSED`.
   - *Compensation / Denial*: If claim is denied or withdrawn, orchestrator triggers reserve release on the ledger (`Debit: Loss Reserves Payable`, `Credit: Claim Loss Expense (Reversal)`).

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
