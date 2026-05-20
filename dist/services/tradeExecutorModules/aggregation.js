"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeAggregationManager = void 0;
const mimicStrategy_1 = require("../../config/mimicStrategy");
class TradeAggregationManager {
    mimicStrategyConfig;
    traderStrategiesMap;
    tradeAggregationBuffer = new Map();
    constructor(mimicStrategyConfig, traderStrategiesMap) {
        this.mimicStrategyConfig = mimicStrategyConfig;
        this.traderStrategiesMap = traderStrategiesMap;
    }
    size() {
        return this.tradeAggregationBuffer.size;
    }
    isEnabledForTrader(traderAddress) {
        const traderStrategy = (0, mimicStrategy_1.getStrategyForTrader)(traderAddress, this.traderStrategiesMap, this.mimicStrategyConfig);
        if (traderStrategy.tradeAggregationEnabled !== undefined) {
            return traderStrategy.tradeAggregationEnabled;
        }
        return false;
    }
    addTrade(trade) {
        const key = this.getAggregationKey(trade);
        const existing = this.tradeAggregationBuffer.get(key);
        const now = Date.now();
        const traderStrategy = (0, mimicStrategy_1.getStrategyForTrader)(trade.userAddress, this.traderStrategiesMap, this.mimicStrategyConfig);
        const aggregationWindowSeconds = traderStrategy.tradeAggregationWindowSeconds ?? 300;
        if (existing) {
            existing.trades.push(trade);
            existing.totalUsdcSize += trade.usdcSize;
            const totalTokens = existing.trades.reduce((sum, item) => sum + (item.size || 0), 0);
            existing.averagePrice =
                totalTokens > 0 ? existing.totalUsdcSize / totalTokens : trade.price;
            existing.lastTradeTime = now;
            return;
        }
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
    }
    getReadyTrades() {
        const ready = [];
        const now = Date.now();
        for (const [key, aggregation] of this.tradeAggregationBuffer.entries()) {
            const timeElapsed = now - aggregation.firstTradeTime;
            const windowMs = aggregation.aggregationWindowSeconds * 1000;
            if (timeElapsed >= windowMs) {
                ready.push(aggregation);
                this.tradeAggregationBuffer.delete(key);
            }
        }
        return ready;
    }
    getAggregationKey(trade) {
        return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
    }
}
exports.TradeAggregationManager = TradeAggregationManager;
