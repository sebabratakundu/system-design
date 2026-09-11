import { LRUCache } from 'lru-cache';
import { LineOfBusiness, RiskAttributes } from '../types/index.js';
import { IRatingStrategy, RatingCalculationResult } from '../patterns/strategy/IRatingStrategy.js';
import { AutoRatingPipeline } from '../patterns/strategy/AutoRatingPipeline.js';
import { PropertyRatingPipeline } from '../patterns/strategy/PropertyRatingPipeline.js';
import { Quote } from '../models/Quote.js';
import { Policyholder } from '../models/Policyholder.js';

export class RatingService {
  private strategies: Map<LineOfBusiness, IRatingStrategy> = new Map();
  private quoteCache: LRUCache<string, RatingCalculationResult>;
  private quotes: Map<string, Quote> = new Map();

  constructor() {
    this.strategies.set(LineOfBusiness.AUTO, new AutoRatingPipeline());
    this.strategies.set(LineOfBusiness.HOMEOWNERS, new PropertyRatingPipeline());

    this.quoteCache = new LRUCache<string, RatingCalculationResult>({
      max: 5000,
      ttl: 1000 * 60 * 15, // 15 minutes TTL
    });
  }

  public registerStrategy(strategy: IRatingStrategy): void {
    this.strategies.set(strategy.lineOfBusiness, strategy);
  }

  public calculateQuote(params: {
    policyholder: Policyholder;
    lineOfBusiness: LineOfBusiness;
    riskAttributes: RiskAttributes;
  }): Quote {
    const strategy = this.strategies.get(params.lineOfBusiness);
    if (!strategy) {
      throw new Error(`No rating strategy registered for Line of Business: ${params.lineOfBusiness}`);
    }

    // Cache key based on risk attribute hash
    const cacheKey = `${params.lineOfBusiness}:${JSON.stringify(params.riskAttributes)}`;
    let rateResult = this.quoteCache.get(cacheKey);

    if (!rateResult) {
      rateResult = strategy.calculateRate(params.riskAttributes);
      this.quoteCache.set(cacheKey, rateResult);
    }

    const quote = new Quote({
      policyholderId: params.policyholder.id,
      lineOfBusiness: params.lineOfBusiness,
      quotedAnnualPremiumCents: rateResult.annualPremiumCents,
      deductibleCents: rateResult.deductibleCents,
      coverages: rateResult.coverages,
      riskAttributes: params.riskAttributes,
    });

    this.quotes.set(quote.id, quote);
    this.quotes.set(quote.quoteNumber, quote);
    return quote;
  }

  public getQuote(idOrNumber: string): Quote | undefined {
    return this.quotes.get(idOrNumber);
  }
}
