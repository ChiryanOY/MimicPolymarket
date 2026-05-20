<div align="center">
  <h1>Polymarket Mimic Trading Bot</h1>
  <p><strong>Mirror top Polymarket traders with automated execution, configurable risk controls, and wallet-mode aware order routing.</strong></p>
  <p><a href="./README.zh-CN.md">中文版本</a></p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC" /></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js Version" /></a>
    <a href="https://polymarket.com/"><img src="https://img.shields.io/badge/Market-Polymarket-6b5cff.svg" alt="Polymarket" /></a>
    <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/Storage-MongoDB-47A248.svg" alt="MongoDB" /></a>
  </p>
</div>

## Why This Bot

The Polymarket Mimic Trading Bot is built for traders who want to follow strong performers without manually chasing every fill. It is especially useful when you want to run different mimic strategies per trader and turn fragmented fills into cleaner aggregated executions.

- Tracks one or many profitable wallets
- Lets you define different mimic settings and risk rules for each trader
- Sizes orders relative to your capital and your configured limits
- Aggregates small trades into more executable orders
- Supports both `LEGACY` wallets and `DEPOSIT` wallet flow
- Persists positions and activity to MongoDB for monitoring and replay

## At A Glance

| What It Does | Why It Matters |
| --- | --- |
| Monitor trader activity continuously | You do not need to watch the market all day |
| Customize strategy per trader | Each wallet can use its own mimic size, limits, slippage, and behavior |
| Recalculate order size against your own balance | Risk stays proportional to your account |
| Aggregate nearby trades into cleaner batches | Small fills become more executable orders with less noise |
| Apply slippage and precision guards before sending orders | Fewer exchange-side rejections |
| Support deposit wallet flow for newer Polymarket API accounts | Avoid `maker address not allowed` failures |

## How It Works

<img alt="screenshot" src="./assets/image.png" />

1. **Select traders** from [Polymarket leaderboard](https://polymarket.com/leaderboard) or [Predictfolio](https://predictfolio.com)
2. **Monitor activity** through the Polymarket Data API
3. **Calculate size** using your wallet balance and per-trader risk settings
4. **Execute orders** with wallet-mode aware routing and exchange precision checks
5. **Track results** in MongoDB with positions, balances, and execution history

## Quick Start

### Prerequisites

- Node.js v18+
- MongoDB database, [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) free tier works
- Polygon wallet with USDC and POL/MATIC for gas
- Polygon RPC endpoint from [Infura](https://infura.io), [Alchemy](https://www.alchemy.com), or similar

### Installation

```bash
# Clone repository
git clone https://github.com/ChiryanOY/polymarket-mimic-trading-bot.git
cd polymarket-mimic-trading-bot

# Install dependencies
npm install

# Create your config
cp .env.docker.example .env

# Optional: run the interactive setup wizard instead
# npm run setup

# If your account requires deposit wallet flow
# npm run setup-deposit-wallet

# Build and verify
npm run build
npm run health-check

# Start trading
npm start
```

## Features

### Execution

- **Multi-Trader Support**: mimic multiple wallets simultaneously
- **Real-Time Execution**: polls trader activity continuously and reacts quickly
- **Trade Aggregation**: combines small nearby trades into cleaner executable batches
- **Price Protection**: applies slippage caps and exchange-compatible precision rounding

### Risk Control

- **Smart Position Sizing**: scales relative to your balance and trader size
- **Per-Trader Overrides**: customize `mimicSize`, max order size, max position size, and slippage per wallet
- **Wallet Mode Validation**: startup blocks if `WALLET_MODE`, `TRADING_WALLET`, and `PRIVATE_KEY` imply different runtime modes

### Operations

- **MongoDB Integration**: stores positions, trades, and execution metadata
- **Health Check Tooling**: validates connectivity and wallet readiness before start
- **Deposit Wallet Support**: handles `POLY_1271` / relayer flow for newer API users

## Monitoring Method

The current implementation monitors trader activity with the **Polymarket Data API** and polls at a configurable interval. This keeps setup simple while still giving fast reaction times for most mimic workflows.

## Configuration

The runtime template is [`/.env.docker.example`](./.env.docker.example).

```bash
cp .env.docker.example .env
```

### Template Variables

| Variable | Description | Example |
| --- | --- | --- |
| `WALLET_MODE` | Trading wallet mode, either `LEGACY` or `DEPOSIT` | `'LEGACY'` |
| `TRADING_WALLET` | Runtime trading wallet. In `LEGACY` mode this is your EOA/Safe. In `DEPOSIT` mode this must be the derived deposit wallet. | `'0x1234...'` |
| `PRIVATE_KEY` | Private key for the owner or signer wallet | `'abc123...'` |
| `RELAYER_URL` | Polymarket relayer endpoint for deposit wallet operations | `'https://relayer-v2.polymarket.com/'` |
| `POLY_BUILDER_API_KEY` | Builder API key for relayer and gasless wallet operations | `'...'` |
| `POLY_BUILDER_API_SECRET` | Builder API secret for relayer and gasless wallet operations | `'...'` |
| `POLY_BUILDER_API_PASSPHRASE` | Builder API passphrase for relayer and gasless wallet operations | `'...'` |
| `POLY_BUILDER_CODE` | Builder code attached to CLOB orders | `'0x...'` |
| `MONGO_URI` | MongoDB connection string | `'mongodb://mongodb:27017/polymarket_mimictrading'` |
| `RPC_URL` | Polygon HTTPS RPC endpoint | `'https://polygon-mainnet.infura.io/v3/your-key'` |
| `CLOB_HTTP_URL` | Polymarket HTTP endpoint | `'https://clob.polymarket.com/'` |
| `CLOB_WS_URL` | Polymarket user WebSocket endpoint used by the current runtime config | `'wss://ws-subscriptions-clob.polymarket.com/ws/user'` |
| `USDC_CONTRACT_ADDRESS` | Polymarket USDC contract | `'0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'` |
| `USER_ADDRESSES` | Trader addresses to mimic, comma-separated | `'0xabc...,0xdef...'` |
| `TRADER_STRATEGIES` | JSON array with per-trader overrides such as `mimicSize`, `maxOrderSizeUSD`, `maxPositionSizeUSD`, slippage, and aggregation options | `'[{"address":"0xabc...","mimicSize":1}]'` |
| `RETRY_LIMIT` | Retry attempts for failed operations | `'5'` |
| `RETRY_DELAY_MS` | Delay between order retries in milliseconds | `'200'` |
| `REQUEST_TIMEOUT_MS` | HTTP request timeout in milliseconds | `'1000'` |
| `NETWORK_RETRY_LIMIT` | Retry attempts for network-level failures | `'10'` |

### Required Runtime Variables

At startup the bot requires:

- `USER_ADDRESSES`
- `TRADING_WALLET`
- `WALLET_MODE`
- `PRIVATE_KEY`
- `CLOB_HTTP_URL`
- `CLOB_WS_URL`
- `MONGO_URI`
- `RPC_URL`
- `USDC_CONTRACT_ADDRESS`

### Wallet Modes

#### `LEGACY`

Use this when your account trades directly through a normal wallet path.

- `TRADING_WALLET` should be your live trading EOA or Safe
- Default template value is `WALLET_MODE='LEGACY'`
- If `TRADING_WALLET` is an EOA, startup requires it to match the signer derived from `PRIVATE_KEY`

#### `DEPOSIT`

Use this when Polymarket requires deposit wallet flow.

- `TRADING_WALLET` must be the deposit wallet derived from `PRIVATE_KEY`
- Startup checks that the address matches the derived deposit wallet
- Startup also checks that the wallet is already deployed onchain as a contract

> If wallet mode and onchain reality do not match, the bot exits immediately instead of submitting orders with the wrong wallet type.

### Deposit Wallet Flow

- If Polymarket returns `maker address not allowed, please use the deposit wallet flow`, your account must trade through a deposit wallet
- Fill in `POLY_BUILDER_API_KEY`, `POLY_BUILDER_API_SECRET`, `POLY_BUILDER_API_PASSPHRASE`, and `POLY_BUILDER_CODE`
- Run `npm run setup-deposit-wallet`
- Copy the derived deposit wallet into `.env` as `TRADING_WALLET`
- Set `WALLET_MODE='DEPOSIT'`
- Re-run `npm run setup-deposit-wallet -- --approve` if you also want to submit the approval batch

### Strategy Notes

- `TRADER_STRATEGIES` must be valid JSON inside a quoted string
- Trader addresses in `USER_ADDRESSES` and `TRADER_STRATEGIES` should use lowercase `0x...` addresses
- The default strategy is `PERCENTAGE`, so you only need to configure `MIMIC_SIZE` if you are using the default global behavior
- The current template example also shows optional fields such as `tradeAggregationEnabled` and `tradeAggregationWindowSeconds`
- The interactive setup wizard can generate a working `.env` file directly

## Finding Traders

1. Visit [Polymarket Leaderboard](https://polymarket.com/leaderboard)
2. Look for traders with positive P&L, win rate above 55%, and active recent history
3. Validate deeper stats with [Predictfolio](https://predictfolio.com)
4. Add chosen wallet addresses to `USER_ADDRESSES`

## Docker Deployment

The current Docker Compose setup starts two services:

- `bot` - the Node.js trading bot
- `mongodb` - a local MongoDB 7 container

`docker-compose.yml` loads environment variables from `.env`, so the easiest workflow is:

```bash
# Create your runtime config from the current template
cp .env.docker.example .env

# Start bot + MongoDB
docker-compose up -d

# View logs
docker-compose logs -f bot
```

### Docker MongoDB URI

If you want the bot container to use the MongoDB service defined in Compose, set:

```bash
MONGO_URI='mongodb://mongodb:27017/polymarket_mimictrading'
```

This works because both services run on the same Compose network and the MongoDB service name is `mongodb`.

### Useful Commands

```bash
# Rebuild after code changes
docker-compose up -d --build

# Follow MongoDB logs
docker-compose logs -f mongodb

# Stop everything
docker-compose down
```

## License

ISC License - See [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on [Polymarket CLOB Client](https://github.com/Polymarket/clob-client)
- Uses [Predictfolio](https://predictfolio.com) for trader analytics
- Powered by Polygon network

---

**Disclaimer:** This software is provided for educational and research purposes only and does not constitute investment advice, financial advice, or any recommendation to trade. Investing and trading in prediction markets, cryptocurrencies, and related assets involve substantial risk, including the possible loss of all capital. You should conduct your own research, evaluate your financial situation carefully, and use this bot entirely at your own risk. The developers are not responsible for any financial losses or damages arising from the use of this software.
