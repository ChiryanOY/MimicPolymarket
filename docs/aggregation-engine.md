# Aggregation Engine Logic

## 1. Purpose

This document explains how the current trade aggregation engine works in code.
It focuses on:

- when aggregation becomes active
- how trades are grouped
- how the aggregation window behaves
- how aggregated trades are executed
- how original MongoDB records are updated before and after aggregation

This document describes the actual implementation, not an abstract proposal.

## 2. Where Aggregation Sits In The Architecture

The aggregation engine is not a standalone service.
It lives inside `tradeExecutor` as an intermediate layer between:

- reading pending mimicked trades from MongoDB
- sending normalized trades into the buy/sell execution pipeline

Actual flow:

1. `tradeMonitor` discovers trader activity and stores new `TRADE` rows.
2. `tradeExecutor` reads pending rows.
3. It decides, per trader, whether aggregation is enabled.
4. If enabled, the trade enters `TradeAggregationManager`.
5. Once the window expires, the engine returns ready aggregations.
6. The executor converts each aggregation into a synthetic trade execution path.
7. Final status is written back to the original trade rows.

Relevant code:

- `src/services/tradeMonitor.ts`
- `src/services/tradeExecutor.ts`
- `src/services/tradeExecutorModules/aggregation.ts`
- `src/services/tradeExecutorModules/persistence.ts`

## 3. Why Aggregation Exists

Aggregation mainly addresses two operational issues:

- a followed trader may emit multiple small trades in a short time window
- executing every small trade separately increases request count, log volume, and execution overhead

The goal is to:

- merge short-burst trades in the same direction
- reduce fragmented mimicked orders
- keep the strategy layer unchanged by feeding it one synthetic trade

In other words, aggregation changes how trades are batched before execution, not how buy/sell strategy itself works.

## 4. When Aggregation Is Enabled

Aggregation is disabled by default.

The decision lives in `TradeAggregationManager.isEnabledForTrader()`.

Current rule:

- if the trader-specific config explicitly sets `tradeAggregationEnabled`, use that value
- otherwise return `false`

So the system default is still immediate execution unless a trader has aggregation enabled in `TRADER_STRATEGIES_MAP`.

Relevant code:

- `isEnabledForTrader()` in `src/services/tradeExecutorModules/aggregation.ts`
- config resolution through `getStrategyForTrader()` in `src/config/mimicStrategy.ts`

Example from `src/services/tradeExecutorModules/aggregation.ts`:

```ts
isEnabledForTrader(traderAddress: string): boolean {
    const traderStrategy = getStrategyForTrader(
        traderAddress,
        this.traderStrategiesMap,
        this.mimicStrategyConfig
    );

    if (traderStrategy.tradeAggregationEnabled !== undefined) {
        return traderStrategy.tradeAggregationEnabled;
    }

    return false;
}
```

This makes the enablement rule explicit in code: aggregation is opt-in per trader, and the fallback is always `false`.

## 5. Core Responsibilities Of `TradeAggregationManager`

`TradeAggregationManager` does only a small, focused set of things:

1. decide whether aggregation is enabled for a trader
2. add incoming trades into an in-memory buffer
3. return aggregation groups whose window has expired

It does not:

- place orders
- call CLOB APIs
- write terminal execution states to MongoDB

That separation is important:

- aggregation owns buffering and grouping
- execution owns buying, selling, retries, and status outcomes

## 6. Grouping Rules

### 6.1 Aggregation Key

The engine groups trades using this key:

```text
userAddress:conditionId:asset:side
```

This means trades are merged only if they share all of the following:

- same source trader
- same `conditionId`
- same `asset`
- same `side`

Relevant code:

- `getAggregationKey()` in `src/services/tradeExecutorModules/aggregation.ts`

Example from `src/services/tradeExecutorModules/aggregation.ts`:

```ts
private getAggregationKey(trade: TradeWithUser): string {
    return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
}
```

This is the exact grouping boundary.
Any change in trader, market, asset, or side creates a new aggregation bucket.

### 6.2 Practical Meaning

The engine will not merge:

- different traders
- different markets for the same trader
- different tokens in the same market
- buys and sells together

This makes the resulting synthetic trade semantically clean and easy to reason about.

## 7. Window Model

### 7.1 Window Source

Each aggregation group carries its own `aggregationWindowSeconds`.

Current resolution order:

- use trader-specific `tradeAggregationWindowSeconds` if set
- otherwise default to `300`

Relevant code:

- `addTrade()` in `src/services/tradeExecutorModules/aggregation.ts`

### 7.2 Fixed Window Behavior

When the first trade for a group arrives, the manager stores:

- `firstTradeTime`
- `lastTradeTime`
- `aggregationWindowSeconds`

A group becomes ready when:

```text
Date.now() - firstTradeTime >= aggregationWindowSeconds * 1000
```

This is a fixed window, not a sliding window.

Important implication:

- additional trades update `lastTradeTime`
- but they do not extend the window deadline

So the first trade starts the clock for the whole group.

Relevant code:

- `addTrade()` and `getReadyTrades()` in `src/services/tradeExecutorModules/aggregation.ts`

Example from `src/services/tradeExecutorModules/aggregation.ts`:

```ts
const aggregationWindowSeconds = traderStrategy.tradeAggregationWindowSeconds ?? 300;

this.tradeAggregationBuffer.set(key, {
    userAddress: trade.userAddress,
    conditionId: trade.conditionId,
    asset: trade.asset,
    side: trade.side || 'BUY',
    slug: trade.slug,
    eventSlug: trade.eventSlug,
    trades: [trade],
    totalUsdcSize: trade.usdcSize,
    averagePrice: trade.price,
    firstTradeTime: now,
    lastTradeTime: now,
    aggregationWindowSeconds,
});
```

This shows two important details:

- the default window is `300` seconds when no trader override exists
- the countdown starts from `firstTradeTime`, not from the most recent trade

## 8. What Happens When A Trade Enters Aggregation

Inside `tradeExecutor`, each pending trade is split into one of two arrays:

- `tradesToAggregate`
- `tradesToExecuteImmediately`

If aggregation is enabled for that trader:

1. the executor marks the trade as processing with `markTradeAsProcessing()`
2. it logs the selected aggregation window
3. it calls `aggregationManager.addTrade(trade)`

That processing mark is important because it prevents the same MongoDB row from being fetched again as a fresh pending trade on the next loop.

Relevant code:

- `tradeExecutor()` in `src/services/tradeExecutor.ts`
- `markTradeAsProcessing()` in `src/services/tradeExecutorModules/persistence.ts`

Example from `src/services/tradeExecutor.ts`:

```ts
for (const trade of tradesToAggregate) {
    await markTradeAsProcessing(trade);
    const traderStrategy = TRADER_STRATEGIES_MAP.get(trade.userAddress.toLowerCase()) || MIMIC_STRATEGY_CONFIG;
    const windowSeconds = traderStrategy.tradeAggregationWindowSeconds ?? 300;
    Logger.info(
        `Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer (${windowSeconds}s window) for ${trade.slug || trade.asset}`
    );
    aggregationManager.addTrade(trade);
}
```

This is the handoff point from the executor to the in-memory buffer.
The trade is marked as processing before it enters aggregation, which prevents it from being read again as a fresh pending record.

## 9. Internal Buffer Updates

When `addTrade()` receives a new trade, it checks whether a buffer entry already exists for the same aggregation key.

If a group already exists, it updates:

- `trades`: append the raw trade
- `totalUsdcSize`: add the incoming trade notional
- `averagePrice`: recalculate weighted average price
- `lastTradeTime`: update to current time

If the group does not exist, it creates a new `AggregatedTrade` object with:

- identifying fields like `userAddress`, `conditionId`, `asset`, `side`
- metadata fields like `slug` and `eventSlug`
- timing fields
- the raw trade list initialized with the first trade

Relevant code:

- `addTrade()` in `src/services/tradeExecutorModules/aggregation.ts`

Example from `src/services/tradeExecutorModules/aggregation.ts`:

```ts
if (existing) {
    existing.trades.push(trade);
    existing.totalUsdcSize += trade.usdcSize;
    const totalTokens = existing.trades.reduce((sum, item) => sum + (item.size || 0), 0);
    existing.averagePrice =
        totalTokens > 0 ? existing.totalUsdcSize / totalTokens : trade.price;
    existing.lastTradeTime = now;
    return;
}
```

This is the core merge step.
The engine appends the raw trade, accumulates notional, recomputes weighted average price, and updates the last-seen timestamp.

## 10. Weighted Average Price Calculation

The aggregation engine does not use a plain arithmetic mean.
It recalculates average price using:

```text
averagePrice = totalUsdcSize / totalTokens
```

Where:

- `totalUsdcSize` is the sum of all grouped trade notionals
- `totalTokens` is the sum of all grouped trade sizes

This is effectively a volume-weighted average price for the grouped trades.

Relevant code:

- `addTrade()` in `src/services/tradeExecutorModules/aggregation.ts`

## 11. When A Group Becomes Ready

On every executor loop, `tradeExecutor` calls:

```text
aggregationManager.getReadyTrades()
```

That method scans the in-memory buffer and:

- returns every group whose fixed window has expired
- removes those groups from the buffer immediately

So each aggregation group is emitted once.

Relevant code:

- `getReadyTrades()` in `src/services/tradeExecutorModules/aggregation.ts`
- caller in `src/services/tradeExecutor.ts`

Example from `src/services/tradeExecutorModules/aggregation.ts`:

```ts
for (const [key, aggregation] of this.tradeAggregationBuffer.entries()) {
    const timeElapsed = now - aggregation.firstTradeTime;
    const windowMs = aggregation.aggregationWindowSeconds * 1000;

    if (timeElapsed >= windowMs) {
        ready.push(aggregation);
        this.tradeAggregationBuffer.delete(key);
    }
}
```

This confirms the engine uses a release-on-expiry model.
Once a group is ready, it is emitted and removed from the buffer in the same pass.

## 12. Ready Aggregation Shape

A ready aggregation contains:

- `userAddress`
- `conditionId`
- `asset`
- `side`
- `slug`
- `eventSlug`
- `trades`
- `totalUsdcSize`
- `averagePrice`
- `firstTradeTime`
- `lastTradeTime`
- `aggregationWindowSeconds`

The most important field is `trades`, because it keeps the original raw MongoDB-derived trades attached to the aggregated unit.

That raw list is later used to write terminal execution results back into the original records.

## 13. How Aggregated Work Is Executed

### 13.1 Re-Grouping By Trader

Ready aggregations are not executed directly in a flat loop.
`doAggregatedTrading()` first groups them by `userAddress` again and sends them through `TraderTaskQueue`.

This preserves an important invariant:

- work for the same trader stays serial
- work across traders can still run concurrently

Relevant code:

- `doAggregatedTrading()` in `src/services/tradeExecutor.ts`
- `TraderTaskQueue` in `src/services/tradeExecutorModules/queue.ts`

### 13.2 Converting To A Synthetic Trade

Inside `executeTraderAggregations()`, each aggregation is converted into a synthetic trade.

Implementation pattern:

- start from the first raw trade object
- replace `usdcSize` with `aggregation.totalUsdcSize`
- replace `size` with total grouped tokens
- replace `price` with `aggregation.averagePrice`
- keep the side as aggregated side

Then the synthetic trade is sent through the same `postOrder()` dispatcher used for immediate execution.

Relevant code:

- `executeTraderAggregations()` in `src/services/tradeExecutorModules/execution.ts`
- `postOrder()` in `src/utils/postOrder.ts`

Example from `src/services/tradeExecutorModules/execution.ts`:

```ts
const totalTokens = aggregation.trades.reduce(
    (sum, trade) => sum + (trade.size || 0),
    0
);
const syntheticTrade = {
    ...aggregation.trades[0],
    usdcSize: aggregation.totalUsdcSize,
    size: totalTokens,
    price: aggregation.averagePrice,
    side: aggregation.side as 'BUY' | 'SELL',
} as unknown as UserActivityInterface;

await postOrder(
    clobClient,
    aggregation.side === 'BUY' ? 'buy' : 'sell',
    context.myPosition,
    context.userPosition,
    syntheticTrade,
    context.myBalance,
    context.userBalance,
    aggregation.userAddress,
    context.myPositions,
    context.userPositions
);
```

This is the exact bridge from aggregation into the normal strategy layer.
The executor does not implement separate aggregated buy/sell logic; it constructs one normalized synthetic trade and passes it through `postOrder()`.

### 13.3 Why This Reuse Matters

This design avoids duplicating buy/sell logic.

The split of responsibility is:

- aggregation layer: decide how to batch trades
- strategy layer: decide how to buy or sell the resulting trade

As a result, immediate execution and aggregated execution share:

- buy sizing rules
- sell sizing rules
- price protection
- exchange interaction
- status mapping

## 14. Impact On Buy And Sell Behavior

### 14.1 Aggregated Buy

When the grouped side is `BUY`, the synthetic trade represents:

- the total grouped token size
- the grouped notional
- the weighted average reference price

That synthetic trade is then processed by the normal buy strategy:

- mimic percentage
- max order size cap
- max position cap
- balance protection
- minimum token threshold
- FOK/GTC buy order logic

So aggregation does not bypass strategy; it only changes the input trade.

### 14.2 Aggregated Sell

When the grouped side is `SELL`, the synthetic trade enters the normal sell strategy.

Because sell execution is based on:

- my current live balance
- my current local position
- the trader's current remaining position
- the synthetic sell size

the effect is that several nearby sell events are compressed into a single larger exit signal.

Relevant code:

- `src/services/tradeExecutorModules/execution.ts`
- `src/utils/postOrderModules/buy.ts`
- `src/utils/postOrderModules/sell.ts`

## 15. MongoDB State Transitions Around Aggregation

### 15.1 Before Aggregation

Fresh trades are stored as:

```text
bot=false, botExcutedTime=0
```

This means they are pending and visible to `readPendingTrades()`.

### 15.2 When Entering Aggregation

Before a trade is placed into the buffer, the executor marks:

```text
botExcutedTime=1
```

This means:

- the trade is no longer pending
- the executor has claimed responsibility for it
- the same record will not be re-fetched as a new pending trade

Relevant code:

- `markTradeAsProcessing()` in `src/services/tradeExecutorModules/persistence.ts`

Example from `src/services/tradeExecutorModules/persistence.ts`:

```ts
export const markTradeAsProcessing = async (trade: TradeWithUser): Promise<void> => {
    const userActivity = getUserActivityModel(trade.userAddress);
    await userActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });
};
```

This one-line state transition is the guardrail that prevents duplicate consumption while the trade is buffered in memory.

### 15.3 After Aggregated Execution

After the synthetic trade completes, `applySyntheticTradeStatus()` copies the final state from the synthetic trade into each original raw trade:

- `bot`
- `buyStatus`
- `sellStatus`

This makes every original record queryable and auditable even though execution happened as a merged operation.

Relevant code:

- `applySyntheticTradeStatus()` in `src/services/tradeExecutorModules/persistence.ts`

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

This is how aggregated execution remains fully traceable.
Although the exchange only sees one synthetic trade, each original activity record still receives a terminal outcome.

## 16. Failure And Recovery Behavior

### 16.1 Immediate Trade Failures

For normal immediate trades, some executor-level exceptions reset:

```text
botExcutedTime=1 -> 0
```

This allows later retries.

### 16.2 Aggregated Failures

For aggregated execution, the behavior is more conservative.
If an aggregation execution block fails, the code attempts to mark all trades in that aggregation as failed terminal outcomes rather than endlessly recycling the same broken group.

This reduces the risk of infinite processing loops for corrupted or repeatedly failing aggregated groups.

Relevant code:

- `resetTradeForRetry()` in `src/services/tradeExecutorModules/persistence.ts`
- error handling inside `executeTraderAggregations()` in `src/services/tradeExecutorModules/execution.ts`

## 17. Idle Logging And Pending Buffer Visibility

`tradeExecutor` periodically emits waiting logs when there is no new immediate work.

If there are still groups inside the aggregation buffer, the waiting log includes the number of buffered trade groups still pending window expiration.

This is useful operationally because it explains a common question:

- "Why were new trades detected, but no order was placed yet?"

In many cases the answer is simply that the aggregation window has not expired yet.

Relevant code:

- waiting branch in `tradeExecutor()` in `src/services/tradeExecutor.ts`

## 18. Current Implementation Characteristics

The current engine has a few defining traits:

- disabled by default
- enabled per trader
- fixed-window batching
- strict grouping by trader, market, asset, and side
- in-memory buffering only
- reuse of the same buy/sell strategy code path after batching
- processing-state protection against duplicate consumption
- conservative failure handling for aggregated execution

## 19. Best Fit And Trade-Offs

This aggregation design is a good fit when:

- a followed trader frequently splits one idea into multiple nearby trades
- you want fewer fragmented mimicked orders
- you want lower executor churn for bursts of small trades

It is less suitable when:

- you need one-to-one reproduction of each exact trader fill
- per-event timing matters more than reduced fragmentation

## 20. One-Sentence Summary

The current aggregation engine is a per-trader, fixed-window batching layer inside `tradeExecutor` that groups raw MongoDB trade records by market and side, turns them into a synthetic trade after the window expires, executes that synthetic trade through the same buy/sell strategy pipeline, and then writes the final outcome back to the original records.
