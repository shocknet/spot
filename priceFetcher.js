import fetch from 'node-fetch';
import priceCache from './priceCache.js';

const COINBASE_API_URL = 'https://api.coinbase.com/v2';
const COINBASE_PRICES_URL = `${COINBASE_API_URL}/prices`;

const CURRENCY_PAIRS = [
  'BTC-USD',
  'BTC-EUR',
  'BTC-CAD',
  'BTC-BRL',
  'BTC-MXN',
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

  async fetchFromCoinbase(url, currencyPair) {
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
      return { response, error: null };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        return { response: null, error: 'timeout' };
      }

      return { response: null, error: error.message };
    }
  }

  cacheSpotPrice(currencyPair, amount, base, currency) {
    this.handleSuccess();
    priceCache.set(currencyPair, { amount, base, currency });
    return { currencyPair, success: true };
  }

  async fetchBtcJpyFromExchangeRates() {
    const currencyPair = 'BTC-JPY';
    const url = `${COINBASE_API_URL}/exchange-rates?currency=BTC`;
    const { response, error } = await this.fetchFromCoinbase(url, currencyPair);

    if (error) {
      return { currencyPair, error };
    }

    if (response.status === 429) {
      this.handleRateLimit();
      return { currencyPair, error: 'rate_limited' };
    }

    if (!response.ok) {
      return { currencyPair, error: `http_${response.status}` };
    }

    const data = await response.json();
    const jpyRate = data?.data?.rates?.JPY;

    if (!jpyRate) {
      return { currencyPair, error: 'invalid_response' };
    }

    return this.cacheSpotPrice(currencyPair, jpyRate, 'BTC', 'JPY');
  }

  async fetchPrice(currencyPair) {
    if (currencyPair === 'BTC-JPY') {
      return this.fetchBtcJpyFromExchangeRates();
    }

    const url = `${COINBASE_PRICES_URL}/${currencyPair}/spot`;
    const { response, error } = await this.fetchFromCoinbase(url, currencyPair);

    if (error) {
      return { currencyPair, error };
    }

    if (response.status === 429) {
      this.handleRateLimit();
      return { currencyPair, error: 'rate_limited' };
    }

    if (!response.ok) {
      return { currencyPair, error: `http_${response.status}` };
    }

    const data = await response.json();

    if (data?.data?.amount) {
      return this.cacheSpotPrice(
        currencyPair,
        data.data.amount,
        data.data.base || 'BTC',
        data.data.currency
      );
    }

    return { currencyPair, error: 'invalid_response' };
  }

  async fetchAllPrices() {
    const promises = CURRENCY_PAIRS.map(pair => this.fetchPrice(pair));
    const results = await Promise.allSettled(promises);

    const summary = {
      success: 0,
      failed: 0,
      rateLimited: false,
      failures: []
    };

    results.forEach((result, index) => {
      const pair = CURRENCY_PAIRS[index];

      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.error === 'rate_limited') {
          summary.rateLimited = true;
          summary.failed++;
          summary.failures.push({ pair: data.currencyPair, error: data.error });
        } else if (data.success) {
          summary.success++;
        } else {
          summary.failed++;
          summary.failures.push({ pair: data.currencyPair, error: data.error });
        }
      } else {
        summary.failed++;
        summary.failures.push({ pair, error: result.reason?.message ?? 'unknown' });
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
