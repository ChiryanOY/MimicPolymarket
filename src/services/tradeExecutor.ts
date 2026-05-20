import { ClobClient } from '@polymarket/clob-client-v2';
import { ENV } from '../config/env';
import Logger from '../utils/logger';
import { TradeAggregationManager } from './tradeExecutorModules/aggregation';
import { executeTraderAggregations, executeTraderTrades } from './tradeExecutorModules/execution';
import {
    createUserActivityModels,
    markTradeAsProcessing,
    markTradesAsProcessing,
    readPendingTrades,
} from './tradeExecutorModules/persistence';
import { TraderTaskQueue } from './tradeExecutorModules/queue';
import { AggregatedTrade, TradeWithUser } from './tradeExecutorModules/types';

const USER_ADDRESSES = ENV.USER_ADDRESSES;
const MIMIC_STRATEGY_CONFIG = ENV.MIMIC_STRATEGY_CONFIG;
const TRADER_STRATEGIES_MAP = ENV.TRADER_STRATEGIES_MAP;

const userActivityModels = createUserActivityModels(USER_ADDRESSES);
const aggregationManager = new TradeAggregationManager(
    MIMIC_STRATEGY_CONFIG,
    TRADER_STRATEGIES_MAP
);
const traderTaskQueue = new TraderTaskQueue();

const groupByTrader = <T extends { userAddress: string }>(items: T[]): Map<string, T[]> => {
    const grouped = new Map<string, T[]>();

    for (const item of items) {
        const key = item.userAddress.toLowerCase();
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(item);
    }

    return grouped;
};

const doTrading = async (clobClient: ClobClient, trades: TradeWithUser[]): Promise<void> => {
    if (trades.length === 0) {
        return;
    }

    await markTradesAsProcessing(trades);

    const tradesByTrader = groupByTrader(trades);
    const traderCount = tradesByTrader.size;
    const activeCount = traderTaskQueue.size();

    if (activeCount > 0) {
        Logger.info(
            `📊 Spawning ${trades.length} trade(s) for ${traderCount} trader(s) (${activeCount} trader(s) already processing)`
        );
    } else if (traderCount > 1) {
        Logger.info(
            `📊 Processing ${trades.length} trades from ${traderCount} traders concurrently`
        );
    }

    for (const [userAddress, userTrades] of tradesByTrader.entries()) {
        traderTaskQueue.enqueue(userAddress, async () => {
            try {
                await executeTraderTrades(clobClient, userAddress, userTrades, {
                    mimicStrategyConfig: MIMIC_STRATEGY_CONFIG,
                    traderStrategiesMap: TRADER_STRATEGIES_MAP,
                });
            } catch (error) {
                Logger.error(
                    `❌ Failed to execute trades for trader ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}: ${error}`
                );
            }
        });
    }
};

const doAggregatedTrading = async (
    clobClient: ClobClient,
    aggregatedTrades: AggregatedTrade[]
): Promise<void> => {
    const aggregationsByTrader = groupByTrader(aggregatedTrades);

    for (const [userAddress, userAggregations] of aggregationsByTrader.entries()) {
        traderTaskQueue.enqueue(userAddress, async () => {
            try {
                await executeTraderAggregations(clobClient, userAddress, userAggregations, {
                    mimicStrategyConfig: MIMIC_STRATEGY_CONFIG,
                    traderStrategiesMap: TRADER_STRATEGIES_MAP,
                });
            } catch (error) {
                Logger.error(
                    `❌ Failed to execute aggregated trades for trader ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}: ${error}`
                );
            }
        });
    }
};

let isRunning = true;

export const stopTradeExecutor = () => {
    isRunning = false;
    Logger.info('Trade executor shutdown requested...');
};

const tradeExecutor = async (clobClient: ClobClient) => {
    Logger.success(`Trade executor ready for ${USER_ADDRESSES.length} trader(s)`);
    Logger.info('Trade aggregation depends on per-trader settings (default: disabled)');

    let lastCheck = Date.now();

    while (isRunning) {
        const trades = await readPendingTrades(userActivityModels);

        if (trades.length > 0) {
            Logger.clearLine();
            Logger.info(`📥 ${trades.length} new trade${trades.length > 1 ? 's' : ''} detected`);

            const tradesToAggregate: TradeWithUser[] = [];
            const tradesToExecuteImmediately: TradeWithUser[] = [];

            for (const trade of trades) {
                if (aggregationManager.isEnabledForTrader(trade.userAddress)) {
                    tradesToAggregate.push(trade);
                } else {
                    tradesToExecuteImmediately.push(trade);
                }
            }

            for (const trade of tradesToAggregate) {
                await markTradeAsProcessing(trade);
                const traderStrategy = TRADER_STRATEGIES_MAP.get(trade.userAddress.toLowerCase()) || MIMIC_STRATEGY_CONFIG;
                const windowSeconds = traderStrategy.tradeAggregationWindowSeconds ?? 300;
                Logger.info(
                    `Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer (${windowSeconds}s window) for ${trade.slug || trade.asset}`
                );
                aggregationManager.addTrade(trade);
            }

            if (tradesToExecuteImmediately.length > 0) {
                Logger.clearLine();
                Logger.header(
                    `⚡ ${tradesToExecuteImmediately.length} IMMEDIATE TRADE${tradesToExecuteImmediately.length > 1 ? 'S' : ''}`
                );
                await doTrading(clobClient, tradesToExecuteImmediately);
            }

            lastCheck = Date.now();
        }

        const readyAggregations = aggregationManager.getReadyTrades();
        if (readyAggregations.length > 0) {
            Logger.clearLine();
            Logger.header(
                `⚡ ${readyAggregations.length} AGGREGATED TRADE${readyAggregations.length > 1 ? 'S' : ''} READY`
            );

            doAggregatedTrading(clobClient, readyAggregations).catch((error) => {
                Logger.error(`❌ Background aggregated trading execution failed: ${error}`);
            });

            lastCheck = Date.now();
        }

        if (trades.length === 0 && Date.now() - lastCheck > 300) {
            const bufferedCount = aggregationManager.size();
            if (bufferedCount > 0) {
                Logger.waiting(USER_ADDRESSES.length, `${bufferedCount} trade group(s) pending`);
            } else {
                Logger.waiting(USER_ADDRESSES.length);
            }
            lastCheck = Date.now();
        }

        if (!isRunning) {
            break;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
    }

    Logger.info('Trade executor stopped');
};

export default tradeExecutor;
