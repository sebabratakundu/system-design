import { CoverageDetail, LineOfBusiness, RiskAttributes } from '../../types/index.js';
import { IRatingStrategy, RatingCalculationResult } from './IRatingStrategy.js';

export class PropertyRatingPipeline implements IRatingStrategy {
  public readonly lineOfBusiness = LineOfBusiness.HOMEOWNERS;

  public calculateRate(risk: RiskAttributes): RatingCalculationResult {
    let baseRate = 1200_00; // $1,200.00 base annual premium
    const breakdown: Record<string, number> = { baseRate };

    // 1. Property Age Factor
    const propAge = risk.propertyAge ?? 10;
    const ageFactor = 1.0 + (propAge > 30 ? 0.25 : propAge > 15 ? 0.1 : 0.0);
    breakdown['propertyAgeFactor'] = Math.round(baseRate * (ageFactor - 1.0));
    baseRate = Math.round(baseRate * ageFactor);

    // 2. Flood / Disaster Zone Multiplier
    const floodZone = risk.floodZoneRisk ?? 'ZONE_X';
    const floodMultiplier = floodZone === 'ZONE_A' ? 1.6 : floodZone === 'ZONE_B' ? 1.25 : 1.0;
    breakdown['floodZoneFactor'] = Math.round(baseRate * (floodMultiplier - 1.0));
    baseRate = Math.round(baseRate * floodMultiplier);

    const propertyValue = risk.propertyValueCents ?? 400_000_00;
    const dwellingPremium = Math.round(baseRate * 0.6);
    const liabilityPremium = Math.round(baseRate * 0.4);

    const coverages: CoverageDetail[] = [
      {
        code: 'HOME_DWELLING',
        name: 'Dwelling Coverage (Structure)',
        limitCents: propertyValue,
        deductibleCents: 1000_00,
        premiumCents: dwellingPremium,
      },
      {
        code: 'HOME_PERSONAL_LIABILITY',
        name: 'Personal Liability ($500k)',
        limitCents: 500_000_00,
        deductibleCents: 0,
        premiumCents: liabilityPremium,
      },
    ];

    return {
      annualPremiumCents: baseRate,
      deductibleCents: 1000_00,
      coverages,
      breakdown,
    };
  }
}
