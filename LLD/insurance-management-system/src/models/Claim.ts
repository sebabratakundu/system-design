import { randomUUID } from 'crypto';
import { ClaimStatus, LossCause } from '../types/index.js';

export interface ClaimReserveRecord {
  id: string;
  reserveType: 'INDEMNITY' | 'EXPENSE';
  amountCents: number;
  allocatedAt: Date;
}

export interface ClaimEvidenceRecord {
  id: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
  uploadedAt: Date;
}

export interface ClaimAssessmentRecord {
  id: string;
  adjusterId: string;
  notes: string;
  estimatedDamageCents: number;
  approvedPayoutCents: number;
  fraudRiskScore: number;
  adjudicatedAt: Date;
}

export class Claim {
  public readonly id: string;
  public readonly claimNumber: string;
  public readonly policyId: string;
  public readonly policyVersionId: string;
  public readonly dateOfLoss: Date;
  public readonly reportedAt: Date;
  public readonly lossCause: LossCause;
  public readonly description: string;
  public readonly incidentLocation: string;
  public status: ClaimStatus;
  public assignedAdjusterId?: string;
  public denialReason?: string;
  public totalReserveCents: number = 0;
  public settlementPayoutCents: number = 0;
  public readonly reserves: ClaimReserveRecord[] = [];
  public readonly evidence: ClaimEvidenceRecord[] = [];
  public assessment?: ClaimAssessmentRecord;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(params: {
    id?: string;
    claimNumber?: string;
    policyId: string;
    policyVersionId: string;
    dateOfLoss: Date;
    lossCause: LossCause;
    description: string;
    incidentLocation: string;
  }) {
    this.id = params.id ?? randomUUID();
    this.claimNumber = params.claimNumber ?? `CLM-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.policyId = params.policyId;
    this.policyVersionId = params.policyVersionId;
    this.dateOfLoss = params.dateOfLoss;
    this.reportedAt = new Date();
    this.lossCause = params.lossCause;
    this.description = params.description;
    this.incidentLocation = params.incidentLocation;
    this.status = ClaimStatus.FILED;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  public allocateReserve(reserveType: 'INDEMNITY' | 'EXPENSE', amountCents: number): void {
    this.reserves.push({
      id: randomUUID(),
      reserveType,
      amountCents,
      allocatedAt: new Date(),
    });
    this.totalReserveCents += amountCents;
    this.updatedAt = new Date();
  }

  public addEvidence(s3Key: string, fileName: string, mimeType: string): void {
    this.evidence.push({
      id: randomUUID(),
      s3Key,
      fileName,
      mimeType,
      uploadedAt: new Date(),
    });
    this.updatedAt = new Date();
  }

  public recordAssessment(assessment: {
    adjusterId: string;
    notes: string;
    estimatedDamageCents: number;
    approvedPayoutCents: number;
    fraudRiskScore: number;
  }): void {
    this.assessment = {
      id: randomUUID(),
      adjusterId: assessment.adjusterId,
      notes: assessment.notes,
      estimatedDamageCents: assessment.estimatedDamageCents,
      approvedPayoutCents: assessment.approvedPayoutCents,
      fraudRiskScore: assessment.fraudRiskScore,
      adjudicatedAt: new Date(),
    };
    this.status = assessment.approvedPayoutCents > 0 
      ? ClaimStatus.ADJUDICATED_APPROVED 
      : ClaimStatus.ADJUDICATED_DENIED;
    this.updatedAt = new Date();
  }

  public settle(disbursedAmountCents: number): void {
    if (this.status !== ClaimStatus.ADJUDICATED_APPROVED) {
      throw new Error(`Cannot settle claim in status ${this.status}`);
    }
    this.settlementPayoutCents = disbursedAmountCents;
    this.status = ClaimStatus.SETTLED;
    this.updatedAt = new Date();
  }

  public close(): void {
    this.status = ClaimStatus.CLOSED;
    this.updatedAt = new Date();
  }
}
