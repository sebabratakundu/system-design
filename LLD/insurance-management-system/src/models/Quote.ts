import { randomUUID } from 'crypto';
import { CoverageDetail, LineOfBusiness, QuoteStatus, RiskAttributes } from '../types/index.js';

export class Quote {
  public readonly id: string;
  public readonly quoteNumber: string;
  public readonly policyholderId: string;
  public readonly lineOfBusiness: LineOfBusiness;
  public readonly quotedAnnualPremiumCents: number;
  public readonly deductibleCents: number;
  public readonly coverages: CoverageDetail[];
  public readonly riskAttributes: RiskAttributes;
  public status: QuoteStatus;
  public readonly expiresAt: Date;
  public readonly createdAt: Date;

  constructor(params: {
    id?: string;
    quoteNumber?: string;
    policyholderId: string;
    lineOfBusiness: LineOfBusiness;
    quotedAnnualPremiumCents: number;
    deductibleCents: number;
    coverages: CoverageDetail[];
    riskAttributes: RiskAttributes;
    expiresInDays?: number;
  }) {
    this.id = params.id ?? randomUUID();
    this.quoteNumber = params.quoteNumber ?? `QTE-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.policyholderId = params.policyholderId;
    this.lineOfBusiness = params.lineOfBusiness;
    this.quotedAnnualPremiumCents = params.quotedAnnualPremiumCents;
    this.deductibleCents = params.deductibleCents;
    this.coverages = params.coverages;
    this.riskAttributes = params.riskAttributes;
    this.status = QuoteStatus.QUOTED;
    this.createdAt = new Date();
    
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + (params.expiresInDays ?? 30));
    this.expiresAt = expiry;
  }

  public isExpired(): boolean {
    return new Date().getTime() > this.expiresAt.getTime();
  }

  public bind(): void {
    if (this.status !== QuoteStatus.QUOTED) {
      throw new Error(`Cannot bind quote in status ${this.status}`);
    }
    if (this.isExpired()) {
      this.status = QuoteStatus.EXPIRED;
      throw new Error(`Cannot bind expired quote ${this.quoteNumber}`);
    }
    this.status = QuoteStatus.BOUND;
  }
}
