# Polymarket Mimic Trading Bot

> 自动跟单 Polymarket 顶级交易者，支持可配置的风险控制以及基于钱包模式的订单路由。

English version: [README.md](./README.md)

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Polymarket](https://img.shields.io/badge/Market-Polymarket-6b5cff.svg)](https://polymarket.com/)
[![MongoDB](https://img.shields.io/badge/Storage-MongoDB-47A248.svg)](https://www.mongodb.com/)

## 为什么使用这个机器人

Polymarket Mimic Trading Bot 面向那些希望跟随优秀交易者、但又不想手动追每一笔成交的用户而构建。

- 跟踪一个或多个高收益钱包
- 按你的资金规模和配置限制动态计算下单大小
- 将较小交易聚合成更容易执行的订单
- 同时支持 `LEGACY` 钱包和 `DEPOSIT` 钱包流程
- 将仓位和活动数据持久化到 MongoDB，方便监控与回放

## 一览

| 功能 | 价值 |
| --- | --- |
| 持续监控交易者活动 | 无需整天盯盘 |
| 按你的账户余额重新计算订单规模 | 风险始终与你的账户规模匹配 |
| 下单前应用滑点和精度保护 | 减少被交易所拒单的情况 |
| 为新版 Polymarket API 账户支持 deposit wallet 流程 | 避免 `maker address not allowed` 错误 |

## 工作原理

<img alt="screenshot" src="./assets/image.png" />

1. 从 [Polymarket Leaderboard](https://polymarket.com/leaderboard) 或 [Predictfolio](https://predictfolio.com) 选择要跟随的交易者
2. 通过 Polymarket Data API 监控其交易活动
3. 根据你的钱包余额和每个交易者的风险参数计算下单规模
4. 使用支持钱包模式感知的路由和交易所精度校验执行订单
5. 将结果记录到 MongoDB，包括仓位、余额和执行历史

## 快速开始

### 前置要求

- Node.js v18+
- MongoDB 数据库，使用 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) 免费层即可
- 具有 USDC 和 POL/MATIC 作为 gas 的 Polygon 钱包
- 来自 [Infura](https://infura.io)、[Alchemy](https://www.alchemy.com) 或类似服务商的 Polygon RPC 节点

### 安装

```bash
# 克隆仓库
git clone https://github.com/ChiryanOY/polymarket-mimic-trading-bot.git
cd polymarket-mimic-trading-bot

# 安装依赖
npm install

# 创建配置文件
cp .env.docker.example .env

# 可选：改为运行交互式配置向导
# npm run setup

# 如果你的账户需要 deposit wallet 流程
# npm run setup-deposit-wallet

# 构建并校验
npm run build
npm run health-check

# 开始交易
npm start
```

> 详细上手说明： [Getting Started Guide](./docs/GETTING_STARTED.md)

## 功能特性

### 执行能力

- **多交易者支持**：可同时跟随多个钱包
- **实时执行**：持续轮询交易者活动并快速响应
- **交易聚合**：将时间和价格相近的小额交易合并成更整洁的可执行批次
- **价格保护**：在下单前应用滑点上限和与交易所兼容的精度处理

### 风险控制

- **智能仓位管理**：按你的余额和被跟随交易者的仓位规模进行比例缩放
- **按交易者单独覆盖参数**：可为每个钱包自定义 `mimicSize`、最大订单金额、最大持仓金额和滑点
- **钱包模式校验**：启动时如果 `WALLET_MODE`、`TRADING_WALLET` 和 `PRIVATE_KEY` 所对应的运行模式不一致，会直接阻止程序启动

### 运维能力

- **MongoDB 集成**：存储仓位、交易和执行元数据
- **健康检查工具**：启动前校验连接状态与钱包可用性
- **Deposit Wallet 支持**：处理新版 API 用户所需的 `POLY_1271` / relayer 流程

## 监控方式

当前实现通过 **Polymarket Data API** 监控交易者活动，并以可配置的时间间隔轮询。这种方式配置简单，同时对大多数跟单场景依然能够提供较快响应。

## 配置说明

运行时模板文件为 [`/.env.docker.example`](./.env.docker.example)。

```bash
cp .env.docker.example .env
```

### 模板变量

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `WALLET_MODE` | 交易钱包模式，可选 `LEGACY` 或 `DEPOSIT` | `'LEGACY'` |
| `TRADING_WALLET` | 运行时使用的交易钱包。在 `LEGACY` 模式下这是你的 EOA/Safe；在 `DEPOSIT` 模式下这里必须是派生出的 deposit wallet。 | `'0x1234...'` |
| `PRIVATE_KEY` | owner 或 signer 钱包的私钥 | `'abc123...'` |
| `RELAYER_URL` | 用于 deposit wallet 操作的 Polymarket relayer 地址 | `'https://relayer-v2.polymarket.com/'` |
| `POLY_BUILDER_API_KEY` | 用于 relayer 和 gasless 钱包操作的 Builder API key | `'...'` |
| `POLY_BUILDER_API_SECRET` | 用于 relayer 和 gasless 钱包操作的 Builder API secret | `'...'` |
| `POLY_BUILDER_API_PASSPHRASE` | 用于 relayer 和 gasless 钱包操作的 Builder API passphrase | `'...'` |
| `POLY_BUILDER_CODE` | 附加到 CLOB 订单中的 Builder code | `'0x...'` |
| `MONGO_URI` | MongoDB 连接字符串 | `'mongodb://mongodb:27017/polymarket_mimictrading'` |
| `RPC_URL` | Polygon HTTPS RPC 节点地址 | `'https://polygon-mainnet.infura.io/v3/your-key'` |
| `CLOB_HTTP_URL` | Polymarket HTTP 接口地址 | `'https://clob.polymarket.com/'` |
| `CLOB_WS_URL` | 当前运行配置使用的 Polymarket 用户 WebSocket 地址 | `'wss://ws-subscriptions-clob.polymarket.com/ws/user'` |
| `USDC_CONTRACT_ADDRESS` | Polymarket 使用的 USDC 合约地址 | `'0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'` |
| `USER_ADDRESSES` | 要跟单的交易者地址，多个地址用逗号分隔 | `'0xabc...,0xdef...'` |
| `TRADER_STRATEGIES` | JSON 数组，可为每个交易者单独配置 `mimicSize`、最大订单金额、最大持仓金额、滑点和聚合参数 | `'[{"address":"0xabc...","mimicSize":1}]'` |
| `RETRY_LIMIT` | 失败操作的重试次数 | `'5'` |
| `RETRY_DELAY_MS` | 订单重试之间的延迟（毫秒） | `'200'` |
| `REQUEST_TIMEOUT_MS` | HTTP 请求超时时间（毫秒） | `'1000'` |
| `NETWORK_RETRY_LIMIT` | 网络层失败的重试次数 | `'10'` |

### 必填运行时变量

机器人启动时必须提供以下变量：

- `USER_ADDRESSES`
- `TRADING_WALLET`
- `WALLET_MODE`
- `PRIVATE_KEY`
- `CLOB_HTTP_URL`
- `CLOB_WS_URL`
- `MONGO_URI`
- `RPC_URL`
- `USDC_CONTRACT_ADDRESS`

### 钱包模式

#### `LEGACY`

当你的账户通过普通钱包路径直接交易时，使用该模式。

- `TRADING_WALLET` 应为你的实际交易 EOA 或 Safe
- 模板中的默认值是 `WALLET_MODE='LEGACY'`
- 如果 `TRADING_WALLET` 是 EOA，启动时会要求它与 `PRIVATE_KEY` 推导出的 signer 地址一致

#### `DEPOSIT`

当 Polymarket 要求使用 deposit wallet 流程时，使用该模式。

- `TRADING_WALLET` 必须是由 `PRIVATE_KEY` 派生出的 deposit wallet
- 启动时会检查该地址是否与派生结果一致
- 启动时还会检查该钱包是否已经以合约形式部署到链上

> 如果钱包模式与链上实际情况不匹配，机器人会立即退出，而不是继续以错误的钱包类型提交订单。

### Deposit Wallet 流程

- 如果 Polymarket 返回 `maker address not allowed, please use the deposit wallet flow`，说明你的账户必须通过 deposit wallet 交易
- 填写 `POLY_BUILDER_API_KEY`、`POLY_BUILDER_API_SECRET`、`POLY_BUILDER_API_PASSPHRASE` 和 `POLY_BUILDER_CODE`
- 运行 `npm run setup-deposit-wallet`
- 将派生出的 deposit wallet 地址写入 `.env` 中的 `TRADING_WALLET`
- 设置 `WALLET_MODE='DEPOSIT'`
- 如果你还想同时提交授权批次，可再次运行 `npm run setup-deposit-wallet -- --approve`

### 策略说明

- `TRADER_STRATEGIES` 必须是放在带引号字符串中的合法 JSON
- `USER_ADDRESSES` 和 `TRADER_STRATEGIES` 中的交易者地址应使用小写 `0x...` 格式
- 默认策略是 `PERCENTAGE`，因此如果你使用全局默认行为，只需要配置 `MIMIC_SIZE`
- 当前模板示例还展示了 `tradeAggregationEnabled` 和 `tradeAggregationWindowSeconds` 等可选字段
- 交互式配置向导也可以直接生成可用的 `.env` 文件

## 如何寻找交易者

1. 打开 [Polymarket Leaderboard](https://polymarket.com/leaderboard)
2. 寻找 P&L 为正、胜率高于 55% 且近期仍活跃的交易者
3. 使用 [Predictfolio](https://predictfolio.com) 进一步验证其统计表现
4. 将选中的钱包地址加入 `USER_ADDRESSES`

## Docker 部署

当前的 Docker Compose 配置会启动两个服务：

- `bot` - Node.js 交易机器人
- `mongodb` - 本地 MongoDB 7 容器

`docker-compose.yml` 会从 `.env` 读取环境变量，因此最简单的使用方式是：

```bash
# 根据当前模板创建运行配置
cp .env.docker.example .env

# 启动 bot + MongoDB
docker-compose up -d

# 查看日志
docker-compose logs -f bot
```

### Docker 中的 MongoDB URI

如果你希望 bot 容器直接使用 Compose 中定义的 MongoDB 服务，请设置：

```bash
MONGO_URI='mongodb://mongodb:27017/polymarket_mimictrading'
```

之所以可行，是因为两个服务运行在同一个 Compose 网络中，而 MongoDB 服务名就是 `mongodb`。

### 常用命令

```bash
# 代码修改后重新构建
docker-compose up -d --build

# 查看 MongoDB 日志
docker-compose logs -f mongodb

# 停止所有服务
docker-compose down
```

## 许可证

ISC License - 详见 [LICENSE](LICENSE) 文件。

## 致谢

- 基于 [Polymarket CLOB Client](https://github.com/Polymarket/clob-client) 构建
- 使用 [Predictfolio](https://predictfolio.com) 进行交易者分析
- 由 Polygon 网络提供支持

---

## 高级版本

**🚀 Version 2 Available:** 一个带有 **RTDS（实时数据流）** 监控能力的高级版本现已作为私有仓库提供。<br />
Version 2 提供了更快的交易检测方式，支持几乎即时的交易复制、更低延迟和更低 API 负载。在高级版本中，跟单体验表现非常出色。

<img width="680" height="313" alt="image (19)" src="https://github.com/user-attachments/assets/d868f9f2-a1dd-4bfe-a76e-d8cbdfbd8497" />

## 交易工具

我还开发了一个基于 **Rust** 构建的 Polymarket 交易机器人。

<img width="1917" height="942" alt="image (21)" src="https://github.com/user-attachments/assets/08a5c962-7f8b-4097-98b6-7a457daa37c9" />
https://www.youtube.com/watch?v=4f6jHT4-DQs

**免责声明：** 本软件仅用于学习和教育目的。交易存在亏损风险，开发者不对使用本机器人所产生的任何财务损失负责。

**支持：** 如有问题，请通过 Telegram 联系 [@ChiryanOY](https://t.me/ChiryanOY) 或通过 Twitter 联系 [@ChiryanOY](https://x.com/ChiryanOY)
