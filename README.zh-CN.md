# Polymarket Mimic Trading Bot

> 自动化 Polymarket 跟单引擎：基于 Account Abstraction (AA) 代理路由、多钱包并发与动态订单聚合的硬核量化节点。

English version: [README.md](./README.md)

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Polymarket](https://img.shields.io/badge/Market-Polymarket-6b5cff.svg)](https://polymarket.com/)
[![MongoDB](https://img.shields.io/badge/Storage-MongoDB-47A248.svg)](https://www.mongodb.com/)

## 为什么构建这个系统？

在 Polymarket 高频博弈中，顶级交易员往往通过极小额的碎单（Snipe）不断吃单，盲目 1:1 跟单会导致 Gas 磨损和极高的滑点；此外，Polymarket 新版 API 强制推行基于 Account Abstraction 的 Deposit Wallet 流程，传统 EOA 钱包直接调用会被 `maker address not allowed` 拦截。

**Polymarket Mimic Trading Bot** 不仅是一个简单的 API Wrapper，而是一个自带状态持久化、订单聚合器、动态风控引擎，并完整兼容 Polymarket 新版 Relayer 路由的自动化执行节点。

### 核心架构特性

- **订单聚合引擎 (Trade Aggregation)**：在内存中建立时间窗机制（如 5 秒），将同一标的、价格偏差在阈值内的碎单聚合成干净的批次订单，规避限流并提升执行效率。
- **动态风控与精度裁剪 (Risk & Precision Scaling)**：细粒度的 JSON 策略矩阵，支持按资金比例动态计算下单 Size，自动处理不同标的的精度要求（Tick Size Handling）和严格滑点保护。
- **底层 AA 代理路由兼容 (Deposit Wallet Flow)**：完整内置 `POLY_1271` 签名协议与 Relayer 交互逻辑。强校验机制确保运行模式、链上合约状态与环境变量严格一致，杜绝资产风险。
- **状态机与容灾设计 (State & Resilience)**：全链路数据（仓位、订单元数据、执行历史）实时写入 MongoDB，内置指数退避算法（Exponential Backoff）的网络层重试机制。

## 核心架构解析

<img alt="screenshot" src="./assets/image.png" />

1. **持续监听**：通过 Polymarket Data API 持续轮询目标地址的活动流。
2. **聚合与清洗**：将高频噪音在时间窗内合并，生成易执行的批次订单。
3. **风控与缩放**：按账户余额和策略矩阵动态计算真实下单规模。
4. **路由与校验**：根据 `WALLET_MODE` 自动切换底层签名逻辑，通过 Relayer 或原生 RPC 广播订单。
5. **持久化**：全生命周期状态写入 MongoDB，支持无缝恢复。

## 快速开始

### 前置要求

- Node.js v18+
- MongoDB 数据库（推荐 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)）
- 具有 USDC 和 POL/MATIC 作为 Gas 的 Polygon 钱包
- Polygon RPC 节点（如 Infura, Alchemy 等）

### 极速部署

```bash
# 克隆仓库
git clone https://github.com/ChiryanOY/polymarket-mimic-trading-bot.git
cd polymarket-mimic-trading-bot

# 安装依赖
npm install

# 初始化配置
cp .env.docker.example .env

# （推荐）运行交互式配置向导
# npm run setup

# 若账户需要 Deposit Wallet 流程，请运行：
# npm run setup-deposit-wallet

# 构建与环境自检
npm run build
npm run health-check

# 启动引擎
npm start
```

## 核心配置说明

运行环境依赖于 `.env` 文件（参考 [`/.env.docker.example`](./.env.docker.example)）。

### 必填环境变量

- `USER_ADDRESSES`: 目标监听钱包，多地址逗号分隔。
- `TRADING_WALLET`: 执行地址（`LEGACY` 下为 EOA/Safe；`DEPOSIT` 下必须为派生出的 Deposit Wallet）。
- `WALLET_MODE`: 路由模式（`LEGACY` 或 `DEPOSIT`）。
- `PRIVATE_KEY`: Owner 或 Signer 的私钥。
- `CLOB_HTTP_URL` / `CLOB_WS_URL`: Polymarket API 接入点。
- `MONGO_URI`: MongoDB 状态机连接。
- `RPC_URL` / `USDC_CONTRACT_ADDRESS`: Polygon 网络配置。

### 深入：钱包路由模式 (Wallet Modes)

#### `LEGACY` 模式
面向早期的 EOA 或 Safe 多签直接签名调用。引擎会强校验 `TRADING_WALLET` 是否与 `PRIVATE_KEY` 派生的 Signer 一致。

#### `DEPOSIT` 模式（新版 API 强制要求）
当 Polymarket 拦截并提示 `maker address not allowed, please use the deposit wallet flow` 时必须启用。
1. 配置 `POLY_BUILDER_API_KEY` 等 Relayer 凭证。
2. 运行 `npm run setup-deposit-wallet` 动态派生 Deposit Wallet，并填入 `TRADING_WALLET`。
3. 引擎启动时会严格校验该地址的链上合约部署状态。

> ⚠️ **安全拦截机制**：若检测到 `WALLET_MODE` 与链上实际情况不符，引擎会在初始化阶段直接抛出 Fatal Error 并阻断运行。

### 深入：策略矩阵配置 (Trader Strategies)

通过 `TRADER_STRATEGIES` 配置细粒度控制。格式为合法 JSON 字符串：

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
默认采用 `PERCENTAGE` 比例跟单算法。

### 📖 交易跟单机制详解 (Trading & Execution Mechanics)

为了让量化执行过程不仅高效且足够安全，机器人在买入和卖出逻辑上采用了两套截然不同的风控链路。以下是核心代码层的机制拆解：

#### 🟢 买入机制 (Buy Order Mechanics)
当监听到“聪明钱”发起买入操作时，引擎会执行一系列严格的条件计算：
1. **基础规模推算**：基于策略中的跟单比例（`mimicSize`），计算出基准目标代币数量：`Trader Tokens * (mimicSize / 100)`。
2. **多重阈值裁剪 (Precision Scaling)**：
   - **单笔限额**：如果目标规模对应的 USD 价值超过 `maxOrderSizeUSD`，将被强行裁剪至该上限。
   - **仓位限额**：引擎会计算当前持仓成本 + 本次订单成本，若超过 `maxPositionSizeUSD`，则仅允许买入剩余额度对应的份额。若剩余额度不足 5 tokens，则直接拒绝下单。
   - **余额保护**：校验本地 USDC 余额，最多仅使用 `99%` 可用资金进行买入，避免因 Gas 或微小滑点导致 `INSUFFICIENT_BALANCE` 报错。
3. **滑点与限价单执行**：基于监听到的 Trader 成交价，向上加上配置的 `buySlippageThreshold`（滑点宽容度），生成一个严格的 **Limit Order（限价单）**。这样能确保哪怕市场剧烈波动，你的买入成本也绝不会高于设定的安全红线。

#### 🔴 卖出机制 (Sell Order Mechanics)
由于卖出操作通常意味着“聪明钱”在止盈或止损，执行的优先级和流动性要求更高。因此引擎在卖出时采取的是“清障 + 市价抢跑”策略：
1. **清理未决买单**：在执行卖出前，引擎会主动取消该标的下所有 Pending 的买单，释放流动资金。
2. **动态比例清仓**：
   - 系统会对比“聪明钱”的卖出数量与其历史总持仓量，计算出真实的**清仓比例（Sell Percentage）**。
   - 随后，系统会将你当前钱包里真实的 CLOB 代币余额乘以该比例，计算出你需要卖出的代币数量。如果聪明钱全仓卖出（或无法追溯历史），引擎将对你的仓位执行 **100% 全仓抛售**。
3. **FOK 抢单逻辑**：
   - 引擎会实时拉取最新的订单簿（Order Book），捕捉当前的最高买价（Best Bid）。
   - 向下减去配置的 `sellSlippageThreshold`，生成防身底价。
   - 采用 **FOK (Fill-or-Kill) 订单类型**向交易所发起请求。FOK 意味着该订单要么立即按指定数量全额成交，要么立刻取消，从而避免碎单挂在账本上无法撮合的情况。
   - 如果遇到流动性变化导致的 FOK 拒单或网络波动，引擎会触发内置的指数退避重试机制（最高 `RETRY_LIMIT` 次），死磕流动性直至出清。

## Docker 容器化交付

提供开箱即用的 `docker-compose.yml`，一键拉起 Bot 与 MongoDB 实例，实现纯粹的 Local Daemon 运行。

```bash
# 初始化环境
cp .env.docker.example .env
# 建议在 .env 中设置：MONGO_URI='mongodb://mongodb:27017/polymarket_mimictrading'

# 启动服务
docker-compose up -d

# 查看引擎日志
docker-compose logs -f bot
```

## 寻找 Alpha (Smart Money)

1. 分析 [Polymarket Leaderboard](https://polymarket.com/leaderboard)。
2. 筛选 P&L 为正、胜率 >55% 且近期活跃的“聪明钱”。
3. 借助 [Predictfolio](https://predictfolio.com) 进行深度数据交叉验证。
4. 填入 `USER_ADDRESSES`，让引擎接管执行。

## 许可证
ISC License - 详见 [LICENSE](LICENSE) 文件。

## 致谢
- 底层依赖 [Polymarket CLOB Client](https://github.com/Polymarket/clob-client)
- 数据分析支持 [Predictfolio](https://predictfolio.com)

---
**免责声明：** 本软件仅供极客研究、代码学习和教育用途，不构成任何财务或投资建议。预测市场具有极高风险，引擎自动化执行可能导致本金全部损失。开发者对任何资金损失概不负责，请在完全掌握源码逻辑的前提下谨慎部署。
