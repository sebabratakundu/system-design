export enum LineOfBusiness {
  AUTO = 'AUTO',
  HOMEOWNERS = 'HOMEOWNERS',
  COMMERCIAL = 'COMMERCIAL',
  LIFE = 'LIFE',
  HEALTH = 'HEALTH',
}

export enum PolicyStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  LAPSED = 'LAPSED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  QUOTED = 'QUOTED',
  BOUND = 'BOUND',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
}

export enum EndorsementType {
  NEW_BUSINESS = 'NEW_BUSINESS',
  MID_TERM_ADJUSTMENT = 'MID_TERM_ADJUSTMENT',
  RENEWAL = 'RENEWAL',
  CANCELLATION = 'CANCELLATION',
}

export enum ClaimStatus {
  FILED = 'FILED',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  ADJUDICATED_APPROVED = 'ADJUDICATED_APPROVED',
  ADJUDICATED_DENIED = 'ADJUDICATED_DENIED',
  SETTLED = 'SETTLED',
  CLOSED = 'CLOSED',
}

export enum LossCause {
  COLLISION = 'COLLISION',
  THEFT = 'THEFT',
  WATER_DAMAGE = 'WATER_DAMAGE',
  WINDSTORM = 'WINDSTORM',
  FIRE = 'FIRE',
  LIABILITY = 'LIABILITY',
}

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum TransactionType {
  PREMIUM_INVOICED = 'PREMIUM_INVOICED',
  PAYMENT_CAPTURED = 'PAYMENT_CAPTURED',
  EARNED_PREMIUM_RECOGNITION = 'EARNED_PREMIUM_RECOGNITION',
  LOSS_RESERVE_ALLOCATED = 'LOSS_RESERVE_ALLOCATED',
  LOSS_RESERVE_RELEASED = 'LOSS_RESERVE_RELEASED',
  CLAIM_PAYOUT_SETTLED = 'CLAIM_PAYOUT_SETTLED',
  PREMIUM_REFUND_ISSUED = 'PREMIUM_REFUND_ISSUED',
}

export interface CoverageDetail {
  code: string;
  name: string;
  limitCents: number;
  deductibleCents: number;
  premiumCents: number;
}

export interface RiskAttributes {
  driverAge?: number;
  vehicleAge?: number;
  priorAccidents?: number;
  vehicleValueCents?: number;
  propertyAge?: number;
  floodZoneRisk?: string;
  propertyValueCents?: number;
  creditTier?: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  [key: string]: unknown;
}
