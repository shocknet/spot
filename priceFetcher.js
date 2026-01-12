import fetch from 'node-fetch';
import priceCache from './priceCache.js';

const COINBASE_BASE_URL = 'https://api.coinbase.com/v2/prices';

const CURRENCY_PAIRS = [
  'BTC-USD',
  'BTC-EUR',
  'BTC-CAD',
  'BTC-BRL',
  'BTC-MXP',
  'BTC-GBP',
  'BTC-CHF',
  'BTC-JPY',
  'BTC-AUD'
];

const REQUEST_TIMEOUT = 5000; // 5 seconds

class PriceFetcher {
  constructor() {
    this.currentInterval = 2500; // 2.5 seconds default
    this.minInterval = 2500;
    this.maxInterval = 20000; // 20 seconds max
    this.backoffMultiplier = 2;
    this.isRateLimited = false;
  }

  async fetchPrice(currencyPair) {
    const url = `${COINBASE_BASE_URL}/${currencyPair}/spot`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'spot-price-mirror/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        this.handleRateLimit();
        return { currencyPair, error: 'rate_limited' };
      }

      if (!response.ok) {
        return { currencyPair, error: `http_${response.status}` };
      }

      const data = await response.json();
      
      if (data && data.data && data.data.amount) {
        this.handleSuccess();
        priceCache.set(currencyPair, {
          amount: data.data.amount,
          base: data.data.base || 'BTC',
          currency: data.data.currency
        });
        return { currencyPair, success: true };
      }

      return { currencyPair, error: 'invalid_response' };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        return { currencyPair, error: 'timeout' };
      }
      
      return { currencyPair, error: error.message };
    }
  }

  async fetchAllPrices() {
    const promises = CURRENCY_PAIRS.map(pair => this.fetchPrice(pair));
    const results = await Promise.allSettled(promises);

    const summary = {
      success: 0,
      failed: 0,
      rateLimited: false
    };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.error === 'rate_limited') {
          summary.rateLimited = true;
          summary.failed++;
        } else if (data.success) {
          summary.success++;
        } else {
          summary.failed++;
        }
      } else {
        summary.failed++;
      }
    });

    return summary;
  }

  handleRateLimit() {
    if (!this.isRateLimited) {
      this.isRateLimited = true;
      console.warn(`[PriceFetcher] Rate limited detected, increasing interval`);
    }
    
    this.currentInterval = Math.min(
      this.currentInterval * this.backoffMultiplier,
      this.maxInterval
    );
  }

  handleSuccess() {
    if (this.isRateLimited) {
      this.isRateLimited = false;
      console.log(`[PriceFetcher] Rate limit cleared, reducing interval`);
    }
    
    if (this.currentInterval > this.minInterval) {
      this.currentInterval = Math.max(
        this.currentInterval / this.backoffMultiplier,
        this.minInterval
      );
    }
  }

  getCurrentInterval() {
    return this.currentInterval;
  }
}

export default new PriceFetcher();
