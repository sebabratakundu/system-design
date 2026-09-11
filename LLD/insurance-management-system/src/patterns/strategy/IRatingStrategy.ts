import { CoverageDetail, LineOfBusiness, RiskAttributes } from '../../types/index.js';

export interface RatingCalculationResult {
  annualPremiumCents: number;
  deductibleCents: number;
  coverages: CoverageDetail[];
  breakdown: Record<string, number>;
}

export interface IRatingStrategy {
  readonly lineOfBusiness: LineOfBusiness;
  calculateRate(risk: RiskAttributes): RatingCalculationResult;
}
