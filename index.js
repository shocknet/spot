import express from 'express';
import rateLimit from 'express-rate-limit';
import priceFetcher from './priceFetcher.js';
import priceCache from './priceCache.js';

const PORT = process.env.PORT || 8888;

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// IP-based rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Price endpoint - matches Coinbase format
app.get('/v2/prices/:pair/spot', (req, res) => {
  const { pair } = req.params;
  const cached = priceCache.get(pair);

  if (!cached) {
    return res.status(404).json({ error: 'Currency pair not found' });
  }

  if (cached.isStale) {
    return res.status(503).json({ 
      error: 'Service temporarily unavailable - data too stale',
      data: cached.data 
    });
  }

  // Match Coinbase format exactly: {"data":{"amount":"...","base":"BTC","currency":"..."}}
  res.json({ data: cached.data });
});

// Start polling loop
let pollingInterval = null;
let isPollingActive = true;

async function pollPrices() {
  if (!isPollingActive) return;
  
  try {
    const summary = await priceFetcher.fetchAllPrices();
    
    if (summary.rateLimited) {
      console.warn(`[Poll] Rate limited - ${summary.success} succeeded, ${summary.failed} failed`);
    } else if (summary.failed > 0) {
      console.warn(`[Poll] ${summary.success} succeeded, ${summary.failed} failed`);
    } else {
      console.log(`[Poll] Successfully updated ${summary.success} prices`);
    }
  } catch (error) {
    console.error(`[Poll] Error during price fetch:`, error);
  }
  
  if (isPollingActive) {
    scheduleNext();
  }
}

function scheduleNext() {
  if (!isPollingActive) return;
  
  const interval = priceFetcher.getCurrentInterval();
  pollingInterval = setTimeout(() => {
    pollPrices();
  }, interval);
}

function startPolling() {
  // Initial fetch
  pollPrices();
}

// Graceful shutdown
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

  // Stop polling
  isPollingActive = false;
  if (pollingInterval) {
    clearTimeout(pollingInterval);
    pollingInterval = null;
  }

  // Close server
  server.close(() => {
    console.log('[Shutdown] HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[Shutdown] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection]', reason);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  startPolling();
});
