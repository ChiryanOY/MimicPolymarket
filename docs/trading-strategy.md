# Buy And Sell Strategy Logic

## 1. Purpose

This document explains how the current repository executes mimicked buy and sell trades.
It focuses on the real implementation, including:

- how a new trader action enters the execution pipeline
- how buy and sell sizes are calculated
- how price protection and risk controls are applied
- how execution results are written back to MongoDB
- which functions and modules are responsible for each step

This document describes the current code behavior, not a theoretical design.

## 2. End-To-End Flow

The system uses two main services:

- `tradeMonitor`: discovers new trader activity and stores it in MongoDB
- `tradeExecutor`: reads pending records, optionally aggregates them, and executes orders

The entry point is `src/index.ts`, which starts both services after environment validation, database connection, health checks, CLOB client initialization, and local state initialization.

High-level flow:

1. `tradeMonitor` polls Polymarket Data API for trader `TRADE` activity.
2. New trades are written into per-trader activity collections.
3. `tradeExecutor` reads records where `bot=false` and `botExcutedTime=0`.
4. The executor decides whether the trade should be aggregated or executed immediately.
5. The unified dispatcher `postOrder()` routes the trade to buy or sell logic.
6. Final execution status is written back to MongoDB using `buyStatus` or `sellStatus`.

Relevant code:

- `src/services/tradeMonitor.ts`
- `src/services/tradeExecutor.ts`
- `src/utils/postOrder.ts`

## 3. Data Model And State Fields

Every mimicked trade stored in MongoDB uses a few core workflow fields:

- `bot`: whether the trade has reached a terminal state
- `botExcutedTime`: whether the trade is currently being processed
- `buyStatus`: final or intermediate status for buy execution
- `sellStatus`: final or intermediate status for sell execution

These fields drive scheduling, deduplication, aggregation handoff, and retry behavior.

Typical meanings:

- `bot=false, botExcutedTime=0`: pending
- `botExcutedTime=1`: currently owned by the executor or aggregation layer
- `bot=true`: terminal state reached
- `botExcutedTime=999`: historical trade ignored during startup bootstrap

Relevant code:

- `src/interfaces/User.ts`
- `src/services/tradeExecutorModules/persistence.ts`
- `src/services/tradeMonitor.ts`

## 4. Configuration Sources

Runtime strategy comes from two levels:

- global default config: `MIMIC_STRATEGY_CONFIG`
- per-trader override config: `TRADER_STRATEGIES_MAP`

The config is parsed in `src/config/env.ts` and shaped in `src/config/mimicStrategy.ts`.

The most important fields currently used by execution are:

- `mimicSize`
- `maxOrderSizeUSD`
- `maxPositionSizeUSD`
- `buySlippageThreshold`
- `sellSlippageThreshold`
- `tradeAggregationEnabled`
- `tradeAggregationWindowSeconds`

Per-trader config overrides global config through `getStrategyForTrader()`.

Relevant code:

- `src/config/env.ts`
- `src/config/mimicStrategy.ts`

## 5. How Trades Reach Buy Or Sell Execution

`tradeExecutor` reads pending trades and groups them by `userAddress`.

Why it does this:

- trades for the same source trader are executed serially
- trades for different source traders can run concurrently

The grouping logic lives in `groupByTrader()` inside `src/services/tradeExecutor.ts`.

From there, trades are split into two paths:

- aggregated path: mark as processing first, then place into aggregation buffer
- immediate path: execute right away

Before actual execution, the executor builds a context in `fetchExecutionContext()` from `src/services/tradeExecutorModules/execution.ts`.
That context includes:

- my current balance
- my current positions
- the trader's current positions
- the trader's current portfolio value

This context is then used for:

- buy-side affordability checks
- sell-side proportional exit calculations
- buy-side position cap enforcement

Example from `src/services/tradeExecutorModules/execution.ts`:

```ts
const calculateBuyTokens = (
    userAddress: string,
    tradeSize: number,
    price: number,
    deps: ExecutionDependencies
): number => {
    const traderStrategy = getStrategyForTrader(
        userAddress,
        deps.traderStrategiesMap,
        deps.mimicStrategyConfig
    );
    const baseTokens = tradeSize * (traderStrategy.mimicSize / 100);
    let tokensToOrder = baseTokens;
    const maxTokensByOrderLimit = traderStrategy.maxOrderSizeUSD / price;

    if (tokensToOrder > maxTokensByOrderLimit) {
        tokensToOrder = maxTokensByOrderLimit;
    }

    return tokensToOrder;
};
```

This snippet shows that the executor performs a lightweight pre-check before the full order module runs.
It already applies the trader's `mimicSize` and the per-order USD cap, which is why very small aggregated or immediate buys can be filtered early.

## 6. Buy Strategy

### 6.1 Entry Points

The buy flow is routed through:

- `postOrder()` in `src/utils/postOrder.ts`
- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`

Before that, `executeTraderTrades()` and `executeTraderAggregations()` do an early minimum-size filter in `src/services/tradeExecutorModules/execution.ts`.

If the estimated mimicked order is below 5 tokens, the trade is marked `BELOW_MIN_SIZE` before calling the full buy module.

### 6.2 Buy Size Model

The current implementation is token-based, not notional-based.

Core formula:

```text
baseTokens = traderTradeSize * (mimicSize / 100)
```

This means the bot copies a percentage of the trader's token amount, not a percentage of the trader's USDC notional directly.

In code:

- `baseTokens` is calculated in `executeBuyOrder()`
- the same simplified sizing logic is also used earlier in `calculateBuyTokens()`

Relevant code:

- `src/utils/postOrderModules/buy.ts`
- `src/services/tradeExecutorModules/execution.ts`

Example from `src/utils/postOrderModules/buy.ts`:

```ts
const baseTokens = trade.size * (traderStrategy.mimicSize / 100);
let tokensToOrder = baseTokens;
let reasoning = `${traderStrategy.mimicSize}% of trader's ${trade.size.toFixed(2)} tokens = ${baseTokens.toFixed(2)} tokens`;

const maxTokensByOrderLimit = traderStrategy.maxOrderSizeUSD / trade.price;
if (tokensToOrder > maxTokensByOrderLimit) {
    reasoning += ` → Capped at max order: ${tokensToOrder.toFixed(2)} → ${maxTokensByOrderLimit.toFixed(2)} tokens`;
    tokensToOrder = maxTokensByOrderLimit;
}
```

This is the first real buy-sizing stage inside the order module.
The bot starts from mimicked token quantity, not mimicked notional, and immediately applies the max-order constraint before any balance or position-cap logic.

### 6.3 Max Order Size Limit

After calculating the base token amount, the bot applies a per-trade USD cap:

```text
maxTokensByOrderLimit = maxOrderSizeUSD / trade.price
tokensToOrder = min(baseTokens, maxTokensByOrderLimit)
```

This protects against oversized mimicked entries when the trader executes a very large order.

Relevant code:

- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`

### 6.4 Max Position Size Limit

If `maxPositionSizeUSD` is configured, the bot checks whether the new buy would push the current position cost above the configured cap.

The logic:

1. locate the current position for the same `conditionId` and `asset`
2. estimate current position cost from `initialValue`
3. estimate new total cost after this buy
4. if the limit would be exceeded:
   - reduce the buy amount to fit the remaining room, or
   - mark the trade as `POSITION_LIMIT_REACHED` if the remaining allowable amount is too small

This is a cost cap, not a raw token cap.

Relevant code:

- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`

Example from `src/utils/postOrderModules/buy.ts`:

```ts
const latestPosition = positions.find(
    (position) =>
        position.conditionId === trade.conditionId && position.asset === trade.asset
);
const currentPositionCost = latestPosition
    ? parseFloat(String(latestPosition.initialValue || '0'))
    : 0;
const newTotalPositionCost = currentPositionCost + tokensToOrder * trade.price;

if (newTotalPositionCost > traderStrategy.maxPositionSizeUSD) {
    const allowedValue = Math.max(
        0,
        traderStrategy.maxPositionSizeUSD - currentPositionCost
    );
    const allowedTokens = allowedValue / trade.price;
```

This is the cost-based cap check.
The implementation compares current position cost plus proposed buy cost against the configured ceiling, then shrinks the order to the remaining room when possible.

### 6.5 Balance Protection

The bot does not spend the full wallet balance.
It keeps a 1% safety buffer:

```text
maxAffordableTokens = (myBalance * 0.99) / trade.price
```

If the calculated order exceeds that limit, the order is reduced.

This helps absorb:

- balance refresh lag
- allowance edge cases
- small price changes between detection and order placement

Relevant code:

- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`

Example from `src/utils/postOrderModules/buy.ts`:

```ts
const maxAffordableTokens = (myBalance * 0.99) / trade.price;
if (tokensToOrder > maxAffordableTokens) {
    reasoning += ` → Reduced to fit balance: ${tokensToOrder.toFixed(2)} → ${maxAffordableTokens.toFixed(2)} tokens`;
    tokensToOrder = maxAffordableTokens;
}
```

The 1% reserve is hard-coded here.
This is one of the last safety reductions before the order price and final placement are built.

### 6.6 Minimum Order Threshold

There are multiple minimum-size checks in the system.

The practical execution rule is:

- buy orders below 5 tokens are not executed

This happens in two places:

- early filtering in the executor
- final reasoning and safety handling in the buy module

Relevant code:

- `calculateBuyTokens()` and callers in `src/services/tradeExecutorModules/execution.ts`
- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`

### 6.7 Buy Price Logic

Buy orders do not blindly chase the trader's execution price.
The bot builds a strict limit price:

```text
rawLimitPrice = min(trade.price + buySlippageThreshold, 0.99)
limitPrice = clampPrice(roundPriceTo2Decimals(rawLimitPrice, false))
```

Meaning:

- it allows only a configured maximum adverse move above the trader's price
- it rounds and clamps the result into a valid price band
- it then submits a `FOK` buy order by default
- if the rounded buy notional is below `$1` but token size is greater than `5`, it uses `GTC` instead

This makes the buy path intentionally conservative.

Relevant code:

- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`
- `src/utils/postOrderModules/shared.ts`

Example from `src/utils/postOrderModules/buy.ts`:

```ts
const effectiveSlippageThreshold =
    traderStrategy.buySlippageThreshold ?? BUY_SLIPPAGE_THRESHOLD;
const rawLimitPrice = Math.min(trade.price + effectiveSlippageThreshold, 0.99);
const limitPrice = clampPrice(roundPriceTo2Decimals(rawLimitPrice, false));
```

This is the exact price-protection step for buys.
The order price is based on trader fill price plus configured slippage, then rounded and clamped into the allowed market price range.

### 6.8 Buy Order Type

The buy path calls `placeLimitOrder()` with:

- `Side.BUY`
- calculated token amount
- protected limit price

The default order type is `FOK`.
When the final rounded buy notional is below `$1` and the token size is greater than `5`, the order type switches to `GTC`.

Relevant code:

- `executeBuyOrder()` in `src/utils/postOrderModules/buy.ts`
- `placeLimitOrder()` in `src/utils/postOrderModules/orders.ts`

### 6.9 Buy Failure Handling

Buy execution maps exchange or business outcomes to explicit database states.

Common statuses:

- `SUCCESS`
- `FAILED`
- `INSUFFICIENT_BALANCE`
- `POSITION_LIMIT_REACHED`
- `MARKET_CLOSED`
- `BELOW_MIN_SIZE`
- `EXECUTION_FAILED`

These states are used to:

- explain why a trade was not mimicked
- prevent endless re-processing
- propagate aggregated execution results back to original records

Relevant code:

- `src/utils/postOrderModules/buy.ts`
- `src/utils/postOrderModules/orders.ts`
- `src/services/tradeExecutorModules/persistence.ts`

## 7. Sell Strategy

### 7.1 Entry Points

The sell flow is routed through:

- `postOrder()` in `src/utils/postOrder.ts`
- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`

Conceptually, buy asks "how much should I enter?" while sell asks "how much of my current position should I unwind now?"

### 7.2 Cancel Pending Buy Orders First

Before selling, the bot calls `cancelBuyOrdersForAsset()`.

This avoids a conflicting state where:

- there are still open buy orders for the same asset
- the bot now wants to reduce or close the position

If cancellation is partial or fails, the bot logs warnings and still proceeds with the sell path.

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`
- `cancelBuyOrdersForAsset()` in `src/utils/postOrderModules/orders.ts`

### 7.3 Real Sellable Balance

The sell path prefers real exchange balance over local memory.

Current order:

1. update CLOB balance cache for the conditional token
2. read real token balance through `getRealBalance()`
3. if that fails, fall back to `myStateManager.getPosition()`

This is stricter than the buy path because overselling is more dangerous than overestimating buy size.

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`
- `src/utils/postOrderModules/balance.ts`
- `src/services/myStateManager.ts`

### 7.4 No Position Shortcut

If the available token balance is effectively zero, the bot stops early and marks:

- `NO_POSITION`

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`

### 7.5 Proportional Exit Logic

The sell flow tries to follow the trader's reduction ratio, not just their raw token quantity.

There are two cases.

Case A: the trader's current position is missing or nearly zero

- the bot treats this as a full exit
- it sells the full local position

Case B: the trader still has a remaining position

- compute a sell percentage from the trader's sell size relative to their current position
- apply that percentage to my own position size

Formula:

```text
traderSellPercent = trade.size / userPosition.size
mySellAmount = myPositionSize * traderSellPercent
```

The code also adds corrections:

- if the percentage comes out above `1`, it recomputes using a fallback expression
- if the percentage is above `0.95`, it is treated as a full exit

This makes the sell strategy resilient to timing drift in the trader position API.

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`

Example from `src/utils/postOrderModules/sell.ts`:

```ts
const myPositionSize = clobTokenBalance;
if (!userPosition || parseFloat(String(userPosition.size || '0')) <= 0.001) {
    remaining = myPositionSize;
} else {
    const userPosSize = parseFloat(String(userPosition.size || '0'));
    let traderSellPercent = 1;

    if (userPosSize > 0) {
        traderSellPercent = trade.size / userPosSize;
        if (traderSellPercent > 1) {
            traderSellPercent = trade.size / (userPosSize + trade.size);
        }
        if (traderSellPercent > 0.95) {
            traderSellPercent = 1;
        }
    }

    remaining = myPositionSize * traderSellPercent;
}
```

This is the core proportional-exit logic.
If the trader position is gone, the bot treats it as a full exit.
Otherwise it derives a sell percentage from the trader's current remaining size and applies that percentage to the local position.

### 7.6 Sell Quantity Safety Adjustments

After calculating the intended sell size, the bot:

- rounds to two decimals
- clamps the amount to actual available balance if necessary

If the final sell amount becomes too small, for example below `0.01`, it marks:

- `INSUFFICIENT_BALANCE`

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`

### 7.7 Sell Price Logic

Sell orders are based on the best current bid in the order book minus a configurable slippage buffer:

```text
rawBid = bestBid
limitPrice = rawBid - sellSlippageThreshold
```

Then the price is:

- rounded
- clamped to a safe valid range
- used to create the final FOK order

This makes the sell path liquidity-aware while still protecting against selling too low.

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`
- `src/utils/postOrderModules/shared.ts`

Example from `src/utils/postOrderModules/sell.ts`:

```ts
const rawBidPrice = parseFloat(maxPriceBid.price);
const effectiveSellSlippageThreshold =
    traderStrategy.sellSlippageThreshold ?? SELL_SLIPPAGE_THRESHOLD;
const priceWithSlippage = Math.max(0.01, rawBidPrice - effectiveSellSlippageThreshold);
const limitPrice = clampPrice(roundPriceTo2Decimals(priceWithSlippage, true));
```

This is the mirrored price-protection logic for sells.
The bot starts from the best visible bid, subtracts a configured slippage buffer, then rounds and clamps before building the FOK order.

### 7.8 Sell Order Type

Sell uses FOK.

Meaning:

- either the full order is filled immediately
- or the order fails as a unit

This is why the sell path contains explicit retry logic and exchange error classification.

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`

### 7.9 Sell Retry Loop

Sell execution runs in a retry loop.

Each retry can:

1. refresh real token balance
2. shrink the remaining size if balance dropped
3. reload the order book
4. submit another FOK sell attempt

The loop stops when:

- everything is sold
- `RETRY_LIMIT` is reached
- a permanent error is detected

Error helpers such as `extractOrderError()`, `isFokFillError()`, and `isPermanentOrderError()` shape the control flow.

Relevant code:

- `executeSellOrder()` in `src/utils/postOrderModules/sell.ts`
- `src/utils/postOrderModules/shared.ts`

Example from `src/utils/postOrderModules/sell.ts`:

```ts
while (remaining > 0 && retry < RETRY_LIMIT) {
    if (retry > 0) {
        const retryRealBalance = await getRealBalance(
            clobClient,
            AssetType.CONDITIONAL,
            trade.asset
        );

        if (retryRealBalance !== null) {
            clobTokenBalance = retryRealBalance;
        }
    }
```

The important behavior here is not just "retry on failure".
The bot refreshes real balance between attempts, which lets it shrink or stop subsequent sell attempts if the available token balance changed after a partial or failed cycle.

### 7.10 Sell Failure States

Common terminal sell outcomes:

- `SUCCESS`
- `NO_POSITION`
- `INSUFFICIENT_BALANCE`
- `NO_BIDS`
- `MARKET_CLOSED`
- `EXCHANGE_REJECTED`
- `RETRY_LIMIT_REACHED`
- `EXECUTION_FAILED`

Operational meaning:

- `NO_BIDS`: there is no bid-side liquidity
- `MARKET_CLOSED`: token or market is no longer tradable
- `EXCHANGE_REJECTED`: the exchange refused the order in a non-recoverable way
- `RETRY_LIMIT_REACHED`: repeated attempts failed

## 8. Shared Risk Controls

### 8.1 Strategy Override Model

The system supports per-trader overrides for:

- mimic percentage
- max order size
- max position size
- buy and sell slippage
- order expiration
- aggregation toggle
- aggregation window

Those settings are resolved once per trader through `getStrategyForTrader()`.

### 8.2 Price Protection

Both buy and sell apply price controls rather than blindly executing at any visible price:

- slippage thresholds
- rounding helpers
- final clamping to valid price bands

### 8.3 Local State And Remote State Together

Execution uses both:

- local state from `myStateManager`
- fresh remote balance and trader position data

This is an intentional hybrid model:

- local state is fast
- remote state is safer for final execution checks

### 8.4 Per-Trader Serial Execution

Trades for the same trader are queued serially through `TraderTaskQueue`.

This avoids:

- out-of-order execution
- balance races
- conflict between immediate and aggregated work for the same trader

Relevant code:

- `src/services/tradeExecutor.ts`
- `src/services/tradeExecutorModules/queue.ts`

## 9. Database State Transitions

### 9.1 Immediate Execution Path

Typical lifecycle:

```text
bot=false, botExcutedTime=0
-> botExcutedTime=1
-> execution succeeds or fails
-> bot=true, buyStatus/sellStatus set to a terminal state
```

### 9.2 Aggregated Execution Path

Before a trade enters the aggregation buffer, it is also marked with:

```text
botExcutedTime=1
```

Later, the aggregation engine creates a synthetic trade and runs the same buy or sell strategy.
After execution, `applySyntheticTradeStatus()` copies terminal fields back into the original raw records.

Example from `src/services/tradeExecutorModules/persistence.ts`:

```ts
export const applySyntheticTradeStatus = async (
    trades: TradeWithUser[],
    syntheticTrade: UserActivityInterface
): Promise<void> => {
    for (const trade of trades) {
        const userActivity = getUserActivityModel(trade.userAddress);
        await userActivity.updateOne(
            { _id: trade._id },
            {
                $set: {
                    bot: syntheticTrade.bot,
                    buyStatus: syntheticTrade.buyStatus,
                    sellStatus: syntheticTrade.sellStatus,
                },
            }
        );
    }
};
```

This is how aggregated execution becomes observable at the raw-trade level.
Even though the exchange only saw one synthetic execution path, every original MongoDB trade record still receives a terminal status.

### 9.3 Retry Recovery

If execution fails because of an executor-level exception rather than a terminal business outcome, the system can reset:

```text
botExcutedTime=1 -> 0
```

This allows the next cycle to retry the trade.

Relevant code:

- `src/services/tradeExecutorModules/persistence.ts`
- `src/services/tradeExecutorModules/execution.ts`

## 10. Relationship To The Aggregation Engine

Buy and sell strategy code does not care whether the incoming trade is:

- an original database trade
- a synthetic trade produced by aggregation

The strategy layer only receives a normalized `trade` object and applies the same execution rules.

So the responsibility split is:

- strategy layer: decide how to buy or sell
- aggregation layer: decide which raw trades should be merged before reaching strategy

## 11. Implementation Summary

The current execution style is:

- conservative on buys: strict limit prices, balance protection, position caps
- execution-focused on sells: cancel conflicting buys first, verify real balances, work from best bid
- operationally stable: per-trader serialization, explicit status writes, retry-aware control flow
- configurable per trader: but still simple enough to reason about from code

If the implementation changes later, this document should be updated against:

- `src/utils/postOrderModules/`
- `src/services/tradeExecutorModules/`
- `src/services/tradeExecutor.ts`
