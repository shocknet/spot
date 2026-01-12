# Spot

A Node.js server that mirrors Bitcoin spot prices from Coinbase API. This service polls Coinbase every 2.5 seconds and serves the cached prices via endpoints matching Coinbase's API format, allowing wallet clients to access prices even when Coinbase blocks certain countries.

## Features

- **Real-time price updates**: Polls Coinbase API every 2.5 seconds for 9 BTC currency pairs
- **Rate limit handling**: Automatic exponential backoff when rate limited (2.5s → 5s → 10s → 20s max)
- **IP-based rate limiting**: Limits client requests to 100 per minute per IP
- **Stale data protection**: Returns 503 if cache is older than 60 seconds
- **Case-insensitive endpoints**: Supports both `BTC-USD` and `btc-usd` formats
- **Memory safe**: Proper cleanup, timeouts, and graceful shutdown
- **Graceful shutdown**: Handles SIGTERM/SIGINT signals cleanly

## Supported Currency Pairs

- BTC-USD (USD)
- BTC-EUR (EUR)
- BTC-CAD (CAD)
- BTC-BRL (BRL)
- BTC-MXP (MXP)
- BTC-GBP (GBP)
- BTC-CHF (CHF)
- BTC-JPY (JPY)
- BTC-AUD (AUD)

## Installation

```bash
npm install
```

## Usage

Start the server:

```bash
npm start
```

Or with a custom port:

```bash
PORT=3000 node index.js
```

The server defaults to port 8888 if `PORT` environment variable is not set.

## API Endpoints

### Get Spot Price

Returns the cached spot price for a currency pair in Coinbase's format.

```
GET /v2/prices/:pair/spot
```

**Parameters:**
- `pair`: Currency pair (e.g., `BTC-USD`, `btc-eur`) - case insensitive

**Response (200 OK):**
```json
{
  "data": {
    "amount": "92066.955",
    "base": "BTC",
    "currency": "USD"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "Currency pair not found"
}
```

**Response (503 Service Unavailable):**
```json
{
  "error": "Service temporarily unavailable - data too stale",
  "data": {
    "amount": "92066.955",
    "base": "BTC",
    "currency": "USD"
  }
}
```

**Response (429 Too Many Requests):**
Returned when client exceeds rate limit (100 requests per minute per IP).

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-12T16:45:51.020Z"
}
```

## Configuration

Environment variables:

- `PORT`: Server port (default: 8888)

## Architecture

The server consists of three main components:

1. **Price Fetcher** (`priceFetcher.js`): Fetches prices from Coinbase API in parallel, handles rate limits with exponential backoff
2. **Price Cache** (`priceCache.js`): In-memory cache storing latest prices with timestamps
3. **Server** (`index.js`): Express server with rate limiting, API routes, and polling loop

## Error Handling

- **Network errors**: Logged and retried, serves cached data if <60 seconds old
- **Rate limits (429)**: Exponential backoff on polling interval, continues serving cached data
- **Invalid responses**: Logged and skipped, keeps serving old value if <60s
- **Stale cache**: Returns 503 if cache entry is >60 seconds old
- **Unhandled rejections**: Logged to prevent crashes

## Memory Safety

- Fixed-size cache (only 9 currency pairs)
- HTTP request timeouts (5 seconds)
- Proper interval cleanup on shutdown
- Promise.allSettled() to prevent unhandled rejections
- Graceful shutdown handlers

## License

MIT
