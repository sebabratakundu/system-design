# Insurance Management System (IMS) Context

High-level architecture domain context for a fault-tolerant, scalable multi-line insurance management platform.

## Language

**Quote**:
A non-binding estimated premium calculation provided to a prospective policyholder based on initial risk inputs.
_Avoid_: Estimate, price tag, proposal

**Policy**:
A legally binding insurance contract between the insurer and policyholder detailing coverages, terms, deductibles, and limits.
_Avoid_: Plan, subscription, package

**Endorsement**:
An amendment or mid-term adjustment (MTA) to an active policy that alters coverages, drivers, deductibles, or terms.
_Avoid_: Modification, patch, update

**First Notice of Loss (FNOL)**:
The initial notification given to an insurer regarding an incident or loss that initiates the claims workflow.
_Avoid_: Incident report, claim filing

**Claim**:
A formal request by a policyholder to the insurer for compensation or coverage for a covered loss or event.
_Avoid_: Ticket, payout request

**Loss Reserve**:
An estimated financial liability set aside on the insurer's balance sheet to pay for pending or reported claims.
_Avoid_: Claim fund, escrow, hold

**Double-Entry Ledger**:
An immutable bookkeeping system where every financial transaction is recorded as equal and offsetting debits and credits across chart of accounts.
_Avoid_: Wallet balance, payment log

**Earned Premium**:
The portion of insurance premium that belongs to the insurer based on the elapsed time of coverage.
_Avoid_: Realized income

**Unearned Premium**:
The portion of premium collected in advance for coverage periods that have not yet elapsed, held as a liability.
_Avoid_: Deferred balance, prepaid pool

## Relationships

- A **Quote** can be accepted and bound to generate a **Policy**
- A **Policy** undergoes zero or more **Endorsements** during its lifecycle
- A **Policy** can have one or more **Claims** filed against its active coverage periods
- A **Claim** triggers the allocation of a **Loss Reserve** on the **Double-Entry Ledger**
- A **Policy** premium creates an initial **Unearned Premium** liability which converts into **Earned Premium** over the policy term

## Example dialogue

> **Dev:** "When a customer files an FNOL, do we instantly issue the settlement payout from the Cash account?"
> **Domain expert:** "No — an FNOL first validates policy coverage at the time of loss, calculates and commits a **Loss Reserve** in the **Double-Entry Ledger**, routes through adjuster evaluation, and only creates a payout upon formal approval."

## Flagged ambiguities

- "Account" was used interchangeably for Customer profile and General Ledger account — resolved: **Policyholder/Customer** refers to the entity, while **Ledger Account** refers to chart-of-accounts in the financial ledger.
