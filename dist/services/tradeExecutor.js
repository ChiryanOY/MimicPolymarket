"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopTradeExecutor = void 0;
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("../utils/logger"));
const aggregation_1 = require("./tradeExecutorModules/aggregation");
const execution_1 = require("./tradeExecutorModules/execution");
const persistence_1 = require("./tradeExecutorModules/persistence");
const queue_1 = require("./tradeExecutorModules/queue");
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const MIMIC_STRATEGY_CONFIG = env_1.ENV.MIMIC_STRATEGY_CONFIG;
const TRADER_STRATEGIES_MAP = env_1.ENV.TRADER_STRATEGIES_MAP;
const userActivityModels = (0, persistence_1.createUserActivityModels)(USER_ADDRESSES);
const aggregationManager = new aggregation_1.TradeAggregationManager(MIMIC_STRATEGY_CONFIG, TRADER_STRATEGIES_MAP);
const traderTaskQueue = new queue_1.TraderTaskQueue();
const groupByTrader = (items) => {
    const grouped = new Map();
    for (const item of items) {
        const key = item.userAddress.toLowerCase();
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(item);
    }
    return grouped;
};
const doTrading = async (clobClient, trades) => {
    if (trades.length === 0) {
        return;
    }
    await (0, persistence_1.markTradesAsProcessing)(trades);
    const tradesByTrader = groupByTrader(trades);
    const traderCount = tradesByTrader.size;
    const activeCount = traderTaskQueue.size();
    if (activeCount > 0) {
        logger_1.default.info(`📊 Spawning ${trades.length} trade(s) for ${traderCount} trader(s) (${activeCount} trader(s) already processing)`);
    }
    else if (traderCount > 1) {
        logger_1.default.info(`📊 Processing ${trades.length} trades from ${traderCount} traders concurrently`);
    }
    for (const [userAddress, userTrades] of tradesByTrader.entries()) {
        traderTaskQueue.enqueue(userAddress, async () => {
            try {
                await (0, execution_1.executeTraderTrades)(clobClient, userAddress, userTrades, {
                    mimicStrategyConfig: MIMIC_STRATEGY_CONFIG,
                    traderStrategiesMap: TRADER_STRATEGIES_MAP,
                });
            }
            catch (error) {
                logger_1.default.error(`❌ Failed to execute trades for trader ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}: ${error}`);
            }
        });
    }
};
const doAggregatedTrading = async (clobClient, aggregatedTrades) => {
    const aggregationsByTrader = groupByTrader(aggregatedTrades);
    for (const [userAddress, userAggregations] of aggregationsByTrader.entries()) {
        traderTaskQueue.enqueue(userAddress, async () => {
            try {
                await (0, execution_1.executeTraderAggregations)(clobClient, userAddress, userAggregations, {
                    mimicStrategyConfig: MIMIC_STRATEGY_CONFIG,
                    traderStrategiesMap: TRADER_STRATEGIES_MAP,
                });
            }
            catch (error) {
                logger_1.default.error(`❌ Failed to execute aggregated trades for trader ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}: ${error}`);
            }
        });
    }
};
let isRunning = true;
const stopTradeExecutor = () => {
    isRunning = false;
    logger_1.default.info('Trade executor shutdown requested...');
};
exports.stopTradeExecutor = stopTradeExecutor;
const tradeExecutor = async (clobClient) => {
    logger_1.default.success(`Trade executor ready for ${USER_ADDRESSES.length} trader(s)`);
    logger_1.default.info('Trade aggregation depends on per-trader settings (default: disabled)');
    let lastCheck = Date.now();
    while (isRunning) {
        const trades = await (0, persistence_1.readPendingTrades)(userActivityModels);
        if (trades.length > 0) {
            logger_1.default.clearLine();
            logger_1.default.info(`📥 ${trades.length} new trade${trades.length > 1 ? 's' : ''} detected`);
            const tradesToAggregate = [];
            const tradesToExecuteImmediately = [];
            for (const trade of trades) {
                if (aggregationManager.isEnabledForTrader(trade.userAddress)) {
                    tradesToAggregate.push(trade);
                }
                else {
                    tradesToExecuteImmediately.push(trade);
                }
            }
            for (const trade of tradesToAggregate) {
                await (0, persistence_1.markTradeAsProcessing)(trade);
                const traderStrategy = TRADER_STRATEGIES_MAP.get(trade.userAddress.toLowerCase()) || MIMIC_STRATEGY_CONFIG;
                const windowSeconds = traderStrategy.tradeAggregationWindowSeconds ?? 300;
                logger_1.default.info(`Adding $${trade.usdcSize.toFixed(2)} ${trade.side} trade to aggregation buffer (${windowSeconds}s window) for ${trade.slug || trade.asset}`);
                aggregationManager.addTrade(trade);
            }
            if (tradesToExecuteImmediately.length > 0) {
                logger_1.default.clearLine();
                logger_1.default.header(`⚡ ${tradesToExecuteImmediately.length} IMMEDIATE TRADE${tradesToExecuteImmediately.length > 1 ? 'S' : ''}`);
                await doTrading(clobClient, tradesToExecuteImmediately);
            }
            lastCheck = Date.now();
        }
        const readyAggregations = aggregationManager.getReadyTrades();
        if (readyAggregations.length > 0) {
            logger_1.default.clearLine();
            logger_1.default.header(`⚡ ${readyAggregations.length} AGGREGATED TRADE${readyAggregations.length > 1 ? 'S' : ''} READY`);
            doAggregatedTrading(clobClient, readyAggregations).catch((error) => {
                logger_1.default.error(`❌ Background aggregated trading execution failed: ${error}`);
            });
            lastCheck = Date.now();
        }
        if (trades.length === 0 && Date.now() - lastCheck > 300) {
            const bufferedCount = aggregationManager.size();
            if (bufferedCount > 0) {
                logger_1.default.waiting(USER_ADDRESSES.length, `${bufferedCount} trade group(s) pending`);
            }
            else {
                logger_1.default.waiting(USER_ADDRESSES.length);
            }
            lastCheck = Date.now();
        }
        if (!isRunning) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    logger_1.default.info('Trade executor stopped');
};
exports.default = tradeExecutor;
