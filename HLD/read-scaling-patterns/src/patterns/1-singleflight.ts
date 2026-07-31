/**
 * PATTERN 1: SingleFlight Request Coalescing
 * 
 * Prevents Thundering Herd / Surge Read traffic from overwhelming downstream databases.
 * Coalesces concurrent calls for the same key so only 1 underlying fetch is executed.
 */
export class SingleFlight {
  private inFlight = new Map<string, Promise<any>>();
  public totalCalls = 0;
  public deduplicatedCalls = 0;
  public actualFetches = 0;

  async do<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    // If an inflight promise exists for this key, await it directly
    if (this.inFlight.has(key)) {
      this.deduplicatedCalls++;
      return this.inFlight.get(key) as Promise<T>;
    }

    // Create the execution promise for the single leader call
    const promise = (async () => {
      try {
        this.actualFetches++;
        return await fetchFn();
      } finally {
        // Remove from map once resolved/rejected
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  public getStats() {
    return {
      totalCalls: this.totalCalls,
      deduplicatedCalls: this.deduplicatedCalls,
      actualFetches: this.actualFetches,
      efficiencyPercent: ((this.deduplicatedCalls / this.totalCalls) * 100).toFixed(2) + '%'
    };
  }

  public resetStats() {
    this.totalCalls = 0;
    this.deduplicatedCalls = 0;
    this.actualFetches = 0;
  }
}
