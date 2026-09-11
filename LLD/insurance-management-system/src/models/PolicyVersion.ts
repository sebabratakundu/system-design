import { randomUUID } from 'crypto';
import { CoverageDetail, EndorsementType } from '../types/index.js';

export class PolicyVersion {
  public readonly id: string;
  public readonly policyId: string;
  public readonly versionNumber: number;
  public readonly endorsementType: EndorsementType;
  public readonly validFrom: Date;
  public readonly validTo: Date;
  public readonly transactionTime: Date;
  public readonly annualPremiumCents: number;
  public readonly coverages: CoverageDetail[];
  public readonly insuredEntities: Record<string, unknown>[];
  public readonly changeSummary?: string;

  constructor(params: {
    id?: string;
    policyId: string;
    versionNumber: number;
    endorsementType: EndorsementType;
    validFrom: Date;
    validTo: Date;
    annualPremiumCents: number;
    coverages: CoverageDetail[];
    insuredEntities: Record<string, unknown>[];
    changeSummary?: string;
  }) {
    this.id = params.id ?? randomUUID();
    this.policyId = params.policyId;
    this.versionNumber = params.versionNumber;
    this.endorsementType = params.endorsementType;
    this.validFrom = params.validFrom;
    this.validTo = params.validTo;
    this.transactionTime = new Date();
    this.annualPremiumCents = params.annualPremiumCents;
    this.coverages = params.coverages;
    this.insuredEntities = params.insuredEntities;
    this.changeSummary = params.changeSummary;
  }

  /**
   * Evaluates if a given date-of-loss falls within this version's coverage window
   */
  public isEffectiveAt(timestamp: Date): boolean {
    const time = timestamp.getTime();
    return time >= this.validFrom.getTime() && time < this.validTo.getTime();
  }

  public getCoverage(code: string): CoverageDetail | undefined {
    return this.coverages.find((c) => c.code === code);
  }
}
