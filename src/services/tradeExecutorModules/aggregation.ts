import { MimicStrategyConfig, getStrategyForTrader } from '../../config/mimicStrategy';
import { AggregatedTrade, TradeWithUser } from './types';

export class TradeAggregationManager {
    private readonly tradeAggregationBuffer = new Map<string, AggregatedTrade>();

    constructor(
        private readonly mimicStrategyConfig: MimicStrategyConfig,
        private readonly traderStrategiesMap: Map<string, MimicStrategyConfig>
    ) {}

    size(): number {
        return this.tradeAggregationBuffer.size;
    }

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

    addTrade(trade: TradeWithUser): void {
        const key = this.getAggregationKey(trade);
        const existing = this.tradeAggregationBuffer.get(key);
        const now = Date.now();
        const traderStrategy = getStrategyForTrader(
            trade.userAddress,
            this.traderStrategiesMap,
            this.mimicStrategyConfig
        );
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

    getReadyTrades(): AggregatedTrade[] {
        const ready: AggregatedTrade[] = [];
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

    private getAggregationKey(trade: TradeWithUser): string {
        return `${trade.userAddress}:${trade.conditionId}:${trade.asset}:${trade.side}`;
    }
}
