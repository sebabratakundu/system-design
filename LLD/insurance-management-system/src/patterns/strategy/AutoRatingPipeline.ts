import { CoverageDetail, LineOfBusiness, RiskAttributes } from '../../types/index.js';
import { IRatingStrategy, RatingCalculationResult } from './IRatingStrategy.js';

export class AutoRatingPipeline implements IRatingStrategy {
  public readonly lineOfBusiness = LineOfBusiness.AUTO;

  public calculateRate(risk: RiskAttributes): RatingCalculationResult {
    let baseRate = 800_00; // $800.00 base annual premium
    const breakdown: Record<string, number> = { baseRate };

    // 1. Driver Age Factor
    let ageMultiplier = 1.0;
    if (risk.driverAge !== undefined) {
      if (risk.driverAge < 25) {
        ageMultiplier = 1.5; // Young driver surcharge
      } else if (risk.driverAge > 65) {
        ageMultiplier = 1.15; // Senior driver factor
      } else {
        ageMultiplier = 0.95; // Preferred age bracket
      }
    }
    breakdown['ageAdjustment'] = Math.round(baseRate * (ageMultiplier - 1.0));
    baseRate = Math.round(baseRate * ageMultiplier);

    // 2. Prior Accidents Factor
    const priorAccidents = risk.priorAccidents ?? 0;
    const accidentMultiplier = 1.0 + priorAccidents * 0.35; // +35% per past incident
    breakdown['accidentSurcharge'] = Math.round(baseRate * (accidentMultiplier - 1.0));
    baseRate = Math.round(baseRate * accidentMultiplier);

    // 3. Vehicle Value Surcharge (0.5% of vehicle value)
    const vehicleValue = risk.vehicleValueCents ?? 25000_00;
    const comprehensiveComp = Math.round(vehicleValue * 0.008);
    const collisionComp = Math.round(vehicleValue * 0.012);
    breakdown['comprehensiveCoverage'] = comprehensiveComp;
    breakdown['collisionCoverage'] = collisionComp;

    const totalPremiumCents = baseRate + comprehensiveComp + collisionComp;
    const deductibleCents = 500_00; // $500 standard collision deductible

    const coverages: CoverageDetail[] = [
      {
        code: 'AUTO_BODILY_INJURY',
        name: 'Bodily Injury Liability ($250k/$500k)',
        limitCents: 500_000_00,
        deductibleCents: 0,
        premiumCents: Math.round(baseRate * 0.55),
      },
      {
        code: 'AUTO_PROPERTY_DAMAGE',
        name: 'Property Damage Liability ($100k)',
        limitCents: 100_000_00,
        deductibleCents: 0,
        premiumCents: Math.round(baseRate * 0.45),
      },
      {
        code: 'AUTO_COLLISION',
        name: 'Collision Coverage',
        limitCents: vehicleValue,
        deductibleCents,
        premiumCents: collisionComp,
      },
      {
        code: 'AUTO_COMPREHENSIVE',
        name: 'Comprehensive (Fire/Theft/Storm)',
        limitCents: vehicleValue,
        deductibleCents: 250_00,
        premiumCents: comprehensiveComp,
      },
    ];

    return {
      annualPremiumCents: totalPremiumCents,
      deductibleCents,
      coverages,
      breakdown,
    };
  }
}
