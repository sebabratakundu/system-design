import { LossCause } from '../types/index.js';
import { Claim } from '../models/Claim.js';
import { PolicyService } from './PolicyService.js';
import { BillingLedgerService } from './BillingLedgerService.js';
import { TransactionalOutbox } from '../patterns/events/TransactionalOutbox.js';
import { DomainEvent } from '../patterns/events/DomainEvent.js';

export class ClaimsService {
  private claims: Map<string, Claim> = new Map();
  private policyService: PolicyService;
  private billingService: BillingLedgerService;
  private outbox: TransactionalOutbox;

  constructor(
    policyService: PolicyService,
    billingService: BillingLedgerService,
    outbox: TransactionalOutbox
  ) {
    this.policyService = policyService;
    this.billingService = billingService;
    this.outbox = outbox;
  }

  /**
   * First Notice of Loss (FNOL) Intake & Bi-Temporal Coverage Verification
   */
  public submitFNOL(params: {
    policyId: string;
    dateOfLoss: Date;
    lossCause: LossCause;
    description: string;
    incidentLocation: string;
    initialEstimatedDamageCents: number;
  }): Claim {
    const policy = this.policyService.getPolicy(params.policyId);

    // 1. Bi-Temporal Verification: Reconstruct exact coverage version at date of loss
    const effectiveVersion = policy.getVersionAt(params.dateOfLoss);
    if (!effectiveVersion) {
      throw new Error(
        `Coverage Verification Failed: Policy ${policy.policyNumber} had no active coverage in effect on Date of Loss: ${params.dateOfLoss.toISOString()}`
      );
    }

    const claim = new Claim({
      policyId: policy.id,
      policyVersionId: effectiveVersion.id,
      dateOfLoss: params.dateOfLoss,
      lossCause: params.lossCause,
      description: params.description,
      incidentLocation: params.incidentLocation,
    });

    // 2. Allocate initial loss reserve on Ledger
    const reserveIdempotencyKey = `RES-INIT-${claim.id}`;
    this.billingService.allocateLossReserve(
      claim.id,
      params.initialEstimatedDamageCents,
      reserveIdempotencyKey
    );
    claim.allocateReserve('INDEMNITY', params.initialEstimatedDamageCents);

    this.claims.set(claim.id, claim);
    this.claims.set(claim.claimNumber, claim);

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'CLAIM',
        aggregateId: claim.id,
        eventType: 'ClaimFiled',
        payload: {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          policyId: policy.id,
          policyVersionNumber: effectiveVersion.versionNumber,
          initialReserveCents: params.initialEstimatedDamageCents,
        },
      })
    );

    return claim;
  }

  /**
   * Adjuster Inspection & Adjudication
   */
  public assessClaim(params: {
    claimId: string;
    adjusterId: string;
    notes: string;
    estimatedDamageCents: number;
    approvedPayoutCents: number;
    fraudRiskScore?: number;
  }): void {
    const claim = this.getClaim(params.claimId);
    claim.recordAssessment({
      adjusterId: params.adjusterId,
      notes: params.notes,
      estimatedDamageCents: params.estimatedDamageCents,
      approvedPayoutCents: params.approvedPayoutCents,
      fraudRiskScore: params.fraudRiskScore ?? 0.05,
    });

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'CLAIM',
        aggregateId: claim.id,
        eventType: 'ClaimAssessed',
        payload: {
          claimId: claim.id,
          approvedPayoutCents: params.approvedPayoutCents,
          status: claim.status,
        },
      })
    );
  }

  /**
   * Settlement Payout Disbursement
   */
  public settleClaim(claimId: string): void {
    const claim = this.getClaim(claimId);
    if (!claim.assessment || claim.assessment.approvedPayoutCents <= 0) {
      throw new Error(`Cannot settle claim ${claim.claimNumber} without an approved payout.`);
    }

    const payoutAmount = claim.assessment.approvedPayoutCents;
    const payoutIdempotencyKey = `PAYOUT-SETTLE-${claim.id}`;

    // Disburse payment on financial ledger
    this.billingService.disburseClaimPayout(claim.id, payoutAmount, payoutIdempotencyKey);
    claim.settle(payoutAmount);
    claim.close();

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'CLAIM',
        aggregateId: claim.id,
        eventType: 'ClaimSettledAndClosed',
        payload: {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          payoutAmountCents: payoutAmount,
        },
      })
    );
  }

  public getClaim(idOrNumber: string): Claim {
    const claim = this.claims.get(idOrNumber);
    if (!claim) {
      throw new Error(`Claim ${idOrNumber} not found.`);
    }
    return claim;
  }
}
