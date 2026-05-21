<div align="center">
  <h1>Polymarket Mimic Trading Bot</h1>
  <p><code>[ SYSTEM_STATUS: ONLINE ]</code> <code>[ LATENCY: OPTIMIZED ]</code></p>
  <p><strong>Industrial-Grade Quantitative Execution Node</strong></p>
  <p><em>Engineered for Account Abstraction (AA) proxy routing, multi-wallet concurrency, and dynamic order aggregation.</em></p>
  <p><em><a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ja.md">日本語</a> | <a href="README.ko.md">한국어</a> | <a href="README.es.md">Español</a> | <a href="README.ru.md">Русский</a></em></p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC" /></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js Version" /></a>
    <a href="https://polymarket.com/"><img src="https://img.shields.io/badge/Market-Polymarket-6b5cff.svg" alt="Polymarket" /></a>
    <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/Storage-MongoDB-47A248.svg" alt="MongoDB" /></a>
  </p>
</div>

## Why Build This System?

In the high-frequency battlefield of Polymarket, top traders ("Smart Money") often execute via numerous micro-trades (snipes). Blind 1:1 mimicking leads to massive gas attrition and extreme slippage. Furthermore, Polymarket's updated API enforces an Account Abstraction-based Deposit Wallet flow, causing traditional EOA calls to be blocked with a `maker address not allowed` error.

**Polymarket Mimic Trading Bot** is not just a simple API wrapper. It is a fully-fledged automated execution node featuring state persistence, an order aggregator, a dynamic risk control engine, and full compatibility with Polymarket's new Relayer routing mechanism.

### Core Architectural Features

- **Trade Aggregation Engine**: Establishes an in-memory time-window (e.g., 5 seconds) to aggregate fragmented snipes on the same market/outcome within a price threshold into clean batch orders, avoiding rate limits and boosting execution efficiency.
- **Dynamic Risk & Precision Scaling**: A fine-grained JSON strategy matrix that dynamically calculates execution size based on your capital ratio, automatically handles exchange-specific Tick Size requirements, and enforces strict slippage caps.
- **AA Proxy Routing (Deposit Wallet Flow)**: Natively implements the `POLY_1271` signature protocol and Relayer interaction logic. Strict validation mechanisms ensure the runtime mode, on-chain contract state, and environment variables are perfectly aligned to prevent asset loss.
- **State Machine & Resilience**: The entire lifecycle (positions, order metadata, execution history) is persisted in real-time to MongoDB. Built-in network retry mechanisms utilize Exponential Backoff algorithms to handle RPC jitters.

## Architecture Overview

<img alt="screenshot" src="./assets/image.png" />

1. **Continuous Monitoring**: Polls the target addresses' activity stream via the Polymarket Data API.
2. **Aggregation & Cleansing**: Merges high-frequency noise within a time window into executable batch orders.
3. **Risk Control & Scaling**: Calculates the true order size dynamically based on account balance and the strategy matrix.
4. **Routing & Validation**: Switches underlying signature logic automatically based on `WALLET_MODE`, broadcasting orders via Relayer or native RPC.
5. **Persistence**: Logs the full state lifecycle to MongoDB for seamless recovery.

## Quick Start

### Prerequisites

- Node.js v18+
- MongoDB database ([MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) recommended)
- Polygon wallet funded with USDC and POL/MATIC for Gas
- Polygon RPC endpoint (e.g., Infura, Alchemy)

### Rapid Deployment

```bash
# Clone the repository
git clone https://github.com/ChiryanOY/MimicPolymarket.git
cd MimicPolymarket

# Install dependencies
npm install

# Initialize configuration
cp .env.docker.example .env

# (Recommended) Run the interactive setup wizard
# npm run setup

# If your account requires the Deposit Wallet flow, run:
# npm run setup-deposit-wallet

# Build and run health checks
npm run build
npm run health-check

# Spin up the execution engine
npm start
```

## Core Configuration Guide

The runtime environment relies on the `.env` file (see [`/.env.docker.example`](./.env.docker.example)).

### Required Environment Variables

- `USER_ADDRESSES`: Target wallets to monitor (comma-separated).
- `TRADING_WALLET`: The execution address (EOA/Safe for `LEGACY`; derived Deposit Wallet for `DEPOSIT`).
- `WALLET_MODE`: Routing mode (`LEGACY` or `DEPOSIT`).
- `PRIVATE_KEY`: Private key of the Owner or Signer.
- `CLOB_HTTP_URL` / `CLOB_WS_URL`: Polymarket API endpoints.
- `MONGO_URI`: MongoDB state machine connection string.
- `RPC_URL` / `USDC_CONTRACT_ADDRESS`: Polygon network configuration.

### Deep Dive: Wallet Routing Modes

#### `LEGACY` Mode
Designed for early EOA or Safe multi-sig direct signature calls. The engine strictly validates whether the `TRADING_WALLET` matches the Signer derived from the `PRIVATE_KEY`.

#### `DEPOSIT` Mode (Mandatory for New API)
Required when Polymarket intercepts calls with `maker address not allowed, please use the deposit wallet flow`.
1. Configure Relayer credentials like `POLY_BUILDER_API_KEY`.
2. Run `npm run setup-deposit-wallet` to dynamically derive the Deposit Wallet, and set it as `TRADING_WALLET`.
3. The engine strictly verifies the on-chain contract deployment status of this address upon startup.

> ⚠️ **Safety Interception**: If the `WALLET_MODE` mismatches the on-chain reality, the engine throws a Fatal Error during initialization and halts to protect your funds.

### Deep Dive: Strategy Matrix Configuration

Fine-grained control is achieved via `TRADER_STRATEGIES`, which must be a valid JSON string:

```json
[
  {
    "address": "0xabc...",
    "mimicSize": 1.0,
    "maxOrderSizeUSD": 500,
    "maxPositionSizeUSD": 2000,
    "tradeAggregationEnabled": true,
    "tradeAggregationWindowSeconds": 5
  }
]
```
The default strategy utilizes a `PERCENTAGE` based proportional scaling algorithm.

### 📖 Deep Dive: Trading & Execution Mechanics

To ensure the quantitative execution is both efficient and highly secure, the bot employs two distinctly different risk-control pipelines for buying and selling. Here is a breakdown of the core mechanics:

#### 🟢 Buy Order Mechanics
When the engine detects a "Smart Money" buy operation, it triggers a rigorous sequence of conditional checks:
1. **Base Size Calculation**: Computes the target token amount based on your configured `mimicSize` percentage: `Trader Tokens * (mimicSize / 100)`.
2. **Multi-Threshold Scaling**:
   - **Max Order Size**: If the calculated token value exceeds `maxOrderSizeUSD`, it is strictly capped at this limit.
   - **Max Position Size**: The engine evaluates your current position cost plus the incoming order cost. If this exceeds `maxPositionSizeUSD`, the order is trimmed to fit the remaining allowance. If the allowance translates to less than 5 tokens, the order is rejected.
   - **Balance Protection**: Checks your current USDC balance and caps the order at `99%` of your available funds to prevent `INSUFFICIENT_BALANCE` errors due to minor price fluctuations or fees.
3. **Slippage & Limit Order Execution**: It takes the trader's execution price and adds the configured `buySlippageThreshold`. A strict **Limit Order** is then generated. This ensures that even during extreme market volatility, your entry cost will never exceed your safety threshold.

#### 🔴 Sell Order Mechanics
Selling usually indicates that "Smart Money" is taking profits or cutting losses. Therefore, execution priority and liquidity capturing are paramount. The engine adopts a "Clear & Market Snipe" strategy:
1. **Clear Pending Buy Orders**: Before executing a sell, the engine actively cancels all your pending BUY orders for that specific asset to free up capital and avoid conflicting trades.
2. **Dynamic Proportional Selling**:
   - The system compares the trader's sell size against their historical position size to calculate the true **Sell Percentage**.
   - It then multiplies your *real CLOB token balance* by this percentage to determine your sell amount. If the trader dumps their entire position (or if their historical position cannot be tracked), the engine will trigger a **100% full liquidation** of your holdings.
3. **FOK (Fill-or-Kill) Execution**:
   - The engine fetches the real-time Order Book to locate the highest buyer (Best Bid).
   - It subtracts your configured `sellSlippageThreshold` to establish a safety floor price.
   - The order is then broadcasted using the **FOK (Fill-or-Kill)** order type. FOK ensures the order is either fully filled immediately or entirely canceled, preventing fragmented partial fills from hanging on the order book.
   - In case of liquidity shifts causing FOK rejections or network issues, the engine triggers an exponential backoff retry mechanism (up to `RETRY_LIMIT`), aggressively chasing liquidity until the position is cleared.

## Docker Containerization

We provide an out-of-the-box `docker-compose.yml` to spin up both the Bot and a MongoDB instance with a single command, achieving a pure Local Daemon execution.

```bash
# Initialize environment
cp .env.docker.example .env
# We recommend setting this in .env: MONGO_URI='mongodb://mongodb:27017/polymarket_mimictrading'

# Start services
docker-compose up -d

# Tail engine logs
docker-compose logs -f bot
```

## Hunting for Alpha (Smart Money)

1. Analyze the [Polymarket Leaderboard](https://polymarket.com/leaderboard).
2. Filter for traders with positive P&L, >55% win rate, and recent activity.
3. Cross-validate deep stats using [Predictfolio](https://predictfolio.com).
4. Inject the selected addresses into `USER_ADDRESSES` and let the engine take over.

## Star History

<a href="https://star-history.com/#ChiryanOY/MimicPolymarket&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ChiryanOY/MimicPolymarket&type=Date" />
  </picture>
</a>

## License
ISC License - See [LICENSE](LICENSE) for details.

## Acknowledgments
- Core dependencies built on [Polymarket CLOB Client V2](https://github.com/Polymarket/clob-client-v2).
- Data analytics powered by [Predictfolio](https://predictfolio.com).

---
**Disclaimer:** This software is provided strictly for technical research, code study, and educational purposes. It does not constitute financial or investment advice. Prediction markets carry extreme risks, and automated execution can result in the total loss of capital. The developers bear no responsibility for any financial losses. Deploy this system at your own risk only after fully understanding the source code logic.
