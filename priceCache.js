class PriceCache {
  constructor() {
    this.cache = new Map();
  }

  set(currencyPair, data) {
    const normalizedKey = currencyPair.toUpperCase();
    this.cache.set(normalizedKey, {
      ...data,
      timestamp: Date.now()
    });
  }

  get(currencyPair) {
    const normalizedKey = currencyPair.toUpperCase();
    const entry = this.cache.get(normalizedKey);
    
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    return {
      data: {
        amount: entry.amount,
        base: entry.base,
        currency: entry.currency
      },
      age,
      isStale: age > 60000 // 60 seconds
    };
  }

  has(currencyPair) {
    const normalizedKey = currencyPair.toUpperCase();
    return this.cache.has(normalizedKey);
  }
}

export default new PriceCache();
