import { ClobClient } from '@polymarket/clob-client-v2';
import {
    MimicStrategyConfig,
    getStrategyForTrader,
} from '../../config/mimicStrategy';
import { UserActivityInterface, UserPositionInterface } from '../../interfaces/User';
import fetchData from '../../utils/fetchData';
import Logger from '../../utils/logger';
import postOrder from '../../utils/postOrder';
import { myStateManager } from '../myStateManager';
import {
    applySyntheticTradeStatus,
    markTradeAsProcessing,
    markTradeStatus,
    resetTradeForRetry,
} from './persistence';
import { AggregatedTrade, TradeExecutionContext, TradeWithUser } from './types';

interface ExecutionDependencies {
    mimicStrategyConfig: MimicStrategyConfig;
    traderStrategiesMap: Map<string, MimicStrategyConfig>;
}

const fetchExecutionContext = async (
    userAddress: string,
    conditionId: string,
    asset: string
): Promise<TradeExecutionContext> => {
    try {
        const userPosPromise = fetchData(
            `https://data-api.polymarket.com/positions?user=${userAddress}`
        );
        const myPositions = myStateManager.getAllPositions() as UserPositionInterface[];
        const userPos = await userPosPromise;
        const userPositions = Array.isArray(userPos) ? (userPos as UserPositionInterface[]) : [];
        const myPosition = myStateManager.getPosition(asset) as UserPositionInterface | undefined;
        const userPosition = userPositions.find(
            (position) => position.conditionId === conditionId && position.asset === asset
        );
        const myBalance = myStateManager.getBalance();
        const userBalance = userPositions.reduce((total, pos) => total + (pos.currentValue || 0), 0);

        return {
            myPositions,
            userPositions,
            myPosition,
            userPosition,
            myBalance,
            userBalance,
        };
    } catch (error) {
        Logger.error(`Failed to fetch positions: ${error}`);
        throw error;
    }
};

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

const markInsufficientBalanceTrades = async (
    trades: TradeWithUser[]
): Promise<void> => {
    for (const trade of trades) {
        await markTradeStatus(trade.userAddress, trade._id, {
            bot: true,
            buyStatus: 'INSUFFICIENT_BALANCE',
        });
    }
};

export const executeTraderTrades = async (
    clobClient: ClobClient,
    _userAddress: string,
    trades: TradeWithUser[],
    deps: ExecutionDependencies
): Promise<void> => {
    for (const trade of trades) {
        try {
            Logger.trade(trade.userAddress, trade.side || 'UNKNOWN', {
                asset: trade.asset,
                side: trade.side,
                amount: trade.usdcSize,
                price: trade.price,
                slug: trade.slug,
                eventSlug: trade.eventSlug,
                transactionHash: trade.transactionHash,
            });

            const context = await fetchExecutionContext(
                trade.userAddress,
                trade.conditionId,
                trade.asset
            );

            Logger.balance(context.myBalance, context.userBalance, trade.userAddress);

            const condition: 'buy' | 'sell' = trade.side === 'BUY' ? 'buy' : 'sell';

            if (condition === 'buy' && context.myBalance < 1) {
                Logger.warning(
                    `⚠️ Insufficient balance ($${context.myBalance.toFixed(2)}) - skipping buy`
                );
                await markTradeStatus(trade.userAddress, trade._id, {
                    bot: true,
                    buyStatus: 'INSUFFICIENT_BALANCE',
                });
                Logger.separator();
                continue;
            }

            await postOrder(
                clobClient,
                condition,
                context.myPosition,
                context.userPosition,
                trade,
                context.myBalance,
                context.userBalance,
                trade.userAddress,
                context.myPositions,
                context.userPositions
            );

            Logger.separator();
        } catch (error) {
            Logger.error(`❌ Trade execution failed for ${trade.slug || trade.asset}: ${error}`);
            Logger.warning('🔄 Resetting trade for retry on next cycle...');

            try {
                await resetTradeForRetry(trade);
            } catch (dbError) {
                Logger.error(`Failed to reset trade status: ${dbError}`);
            }

            Logger.separator();
        }
    }
};

export const executeTraderAggregations = async (
    clobClient: ClobClient,
    _userAddress: string,
    aggregatedTrades: AggregatedTrade[],
    deps: ExecutionDependencies
): Promise<void> => {
    for (const aggregation of aggregatedTrades) {
        try {
            Logger.header(
                `📊 AGGREGATED TRADE (${aggregation.trades.length} trades combined)`
            );
            Logger.info(
                `Market: ${aggregation.slug || aggregation.asset} | Side: ${aggregation.side} | Volume: $${aggregation.totalUsdcSize.toFixed(2)} | Avg price: $${aggregation.averagePrice.toFixed(4)}`
            );

            for (const trade of aggregation.trades) {
                await markTradeAsProcessing(trade);
            }

            const context = await fetchExecutionContext(
                aggregation.userAddress,
                aggregation.conditionId,
                aggregation.asset
            );

            Logger.balance(
                context.myBalance,
                context.userBalance,
                aggregation.userAddress
            );

            if (aggregation.side === 'BUY' && context.myBalance < 1) {
                Logger.warning(
                    `⚠️ Insufficient balance ($${context.myBalance.toFixed(2)}) - skipping aggregated buy`
                );
                await markInsufficientBalanceTrades(aggregation.trades);
                continue;
            }

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

            try {
                await applySyntheticTradeStatus(aggregation.trades, syntheticTrade);
            } catch (dbError) {
                Logger.error(`Failed to apply aggregated trade status: ${dbError}`);
            }

            Logger.separator();
        } catch (error) {
            Logger.error(
                `❌ Aggregated trade execution failed for ${aggregation.slug || aggregation.asset}: ${error}`
            );
            Logger.warning(
                '⚠️ Stopping retries for this aggregated group to prevent infinite loop.'
            );

            for (const trade of aggregation.trades) {
                try {
                    await markTradeStatus(trade.userAddress, trade._id, {
                        $set: {
                            bot: true,
                            buyStatus: 'EXECUTION_FAILED',
                            sellStatus: 'EXECUTION_FAILED',
                        },
                    });
                } catch (dbError) {
                    Logger.error(`Failed to set failed status: ${dbError}`);
                }
            }

            Logger.separator();
        }
    }
};
