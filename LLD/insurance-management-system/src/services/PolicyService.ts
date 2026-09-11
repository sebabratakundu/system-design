import { EndorsementType, LineOfBusiness } from '../types/index.js';
import { Policy } from '../models/Policy.js';
import { PolicyVersion } from '../models/PolicyVersion.js';
import { Quote } from '../models/Quote.js';
import { TransactionalOutbox } from '../patterns/events/TransactionalOutbox.js';
import { DomainEvent } from '../patterns/events/DomainEvent.js';

export class PolicyService {
  private policies: Map<string, Policy> = new Map();
  private outbox: TransactionalOutbox;

  constructor(outbox: TransactionalOutbox) {
    this.outbox = outbox;
  }

  public createPolicyDraft(quote: Quote, insuredEntities: Record<string, unknown>[]): Policy {
    const termStart = new Date();
    const termEnd = new Date();
    termEnd.setFullYear(termEnd.getFullYear() + 1);

    const initialVersion = new PolicyVersion({
      policyId: '', // Will link to policy
      versionNumber: 1,
      endorsementType: EndorsementType.NEW_BUSINESS,
      validFrom: termStart,
      validTo: termEnd,
      annualPremiumCents: quote.quotedAnnualPremiumCents,
      coverages: quote.coverages,
      insuredEntities,
      changeSummary: 'Initial policy issuance from bound quote.',
    });

    const policy = new Policy({
      policyholderId: quote.policyholderId,
      lineOfBusiness: quote.lineOfBusiness,
      termStartDate: termStart,
      termEndDate: termEnd,
      initialVersion,
    });

    // Backlink policy ID
    (initialVersion as unknown as { policyId: string }).policyId = policy.id;

    this.policies.set(policy.id, policy);
    this.policies.set(policy.policyNumber, policy);

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'POLICY',
        aggregateId: policy.id,
        eventType: 'PolicyDraftCreated',
        payload: {
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          premiumCents: quote.quotedAnnualPremiumCents,
        },
      })
    );

    return policy;
  }

  public activatePolicy(policyId: string): Policy {
    const policy = this.getPolicy(policyId);
    policy.activate();

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'POLICY',
        aggregateId: policy.id,
        eventType: 'PolicyIssued',
        payload: {
          policyId: policy.id,
          policyNumber: policy.policyNumber,
          versionNumber: policy.currentVersion.versionNumber,
          effectiveStart: policy.termStartDate,
        },
      })
    );

    return policy;
  }

  /**
   * Endorsement / Mid-Term Adjustment (MTA)
   * Stretches previous version's validTo to effectiveDate, creates new version from effectiveDate to termEnd
   */
  public applyEndorsement(params: {
    policyId: string;
    effectiveDate: Date;
    newAnnualPremiumCents: number;
    updatedCoverages: typeof PolicyVersion.prototype.coverages;
    updatedEntities: Record<string, unknown>[];
    endorsementReason: string;
  }): PolicyVersion {
    const policy = this.getPolicy(params.policyId);
    const prevVersion = policy.currentVersion;

    // Truncate previous version valid window
    (prevVersion as unknown as { validTo: Date }).validTo = params.effectiveDate;

    const newVersion = new PolicyVersion({
      policyId: policy.id,
      versionNumber: prevVersion.versionNumber + 1,
      endorsementType: EndorsementType.MID_TERM_ADJUSTMENT,
      validFrom: params.effectiveDate,
      validTo: policy.termEndDate,
      annualPremiumCents: params.newAnnualPremiumCents,
      coverages: params.updatedCoverages,
      insuredEntities: params.updatedEntities,
      changeSummary: params.endorsementReason,
    });

    policy.endorse(newVersion);

    this.outbox.append(
      new DomainEvent({
        aggregateType: 'POLICY',
        aggregateId: policy.id,
        eventType: 'PolicyEndorsed',
        payload: {
          policyId: policy.id,
          newVersionNumber: newVersion.versionNumber,
          validFrom: newVersion.validFrom,
          premiumCents: newVersion.annualPremiumCents,
        },
      })
    );

    return newVersion;
  }

  public getPolicy(idOrNumber: string): Policy {
    const policy = this.policies.get(idOrNumber);
    if (!policy) {
      throw new Error(`Policy ${idOrNumber} not found.`);
    }
    return policy;
  }
}
