"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeTraderAggregations = exports.executeTraderTrades = void 0;
const mimicStrategy_1 = require("../../config/mimicStrategy");
const fetchData_1 = __importDefault(require("../../utils/fetchData"));
const logger_1 = __importDefault(require("../../utils/logger"));
const postOrder_1 = __importDefault(require("../../utils/postOrder"));
const myStateManager_1 = require("../myStateManager");
const persistence_1 = require("./persistence");
const fetchExecutionContext = async (userAddress, conditionId, asset) => {
    try {
        const userPosPromise = (0, fetchData_1.default)(`https://data-api.polymarket.com/positions?user=${userAddress}`);
        const myPositions = myStateManager_1.myStateManager.getAllPositions();
        const userPos = await userPosPromise;
        const userPositions = Array.isArray(userPos) ? userPos : [];
        const myPosition = myStateManager_1.myStateManager.getPosition(asset);
        const userPosition = userPositions.find((position) => position.conditionId === conditionId && position.asset === asset);
        const myBalance = myStateManager_1.myStateManager.getBalance();
        const userBalance = userPositions.reduce((total, pos) => total + (pos.currentValue || 0), 0);
        return {
            myPositions,
            userPositions,
            myPosition,
            userPosition,
            myBalance,
            userBalance,
        };
    }
    catch (error) {
        logger_1.default.error(`Failed to fetch positions: ${error}`);
        throw error;
    }
};
const calculateBuyTokens = (userAddress, tradeSize, price, deps) => {
    const traderStrategy = (0, mimicStrategy_1.getStrategyForTrader)(userAddress, deps.traderStrategiesMap, deps.mimicStrategyConfig);
    const baseTokens = tradeSize * (traderStrategy.mimicSize / 100);
    let tokensToOrder = baseTokens;
    const maxTokensByOrderLimit = traderStrategy.maxOrderSizeUSD / price;
    if (tokensToOrder > maxTokensByOrderLimit) {
        tokensToOrder = maxTokensByOrderLimit;
    }
    return tokensToOrder;
};
const markInsufficientBalanceTrades = async (trades) => {
    for (const trade of trades) {
        await (0, persistence_1.markTradeStatus)(trade.userAddress, trade._id, {
            bot: true,
            buyStatus: 'INSUFFICIENT_BALANCE',
        });
    }
};
const executeTraderTrades = async (clobClient, _userAddress, trades, deps) => {
    for (const trade of trades) {
        try {
            logger_1.default.trade(trade.userAddress, trade.side || 'UNKNOWN', {
                asset: trade.asset,
                side: trade.side,
                amount: trade.usdcSize,
                price: trade.price,
                slug: trade.slug,
                eventSlug: trade.eventSlug,
                transactionHash: trade.transactionHash,
            });
            const context = await fetchExecutionContext(trade.userAddress, trade.conditionId, trade.asset);
            logger_1.default.balance(context.myBalance, context.userBalance, trade.userAddress);
            const condition = trade.side === 'BUY' ? 'buy' : 'sell';
            if (condition === 'buy' && context.myBalance < 1) {
                logger_1.default.warning(`⚠️ Insufficient balance ($${context.myBalance.toFixed(2)}) - skipping buy`);
                await (0, persistence_1.markTradeStatus)(trade.userAddress, trade._id, {
                    bot: true,
                    buyStatus: 'INSUFFICIENT_BALANCE',
                });
                logger_1.default.separator();
                continue;
            }
            await (0, postOrder_1.default)(clobClient, condition, context.myPosition, context.userPosition, trade, context.myBalance, context.userBalance, trade.userAddress, context.myPositions, context.userPositions);
            logger_1.default.separator();
        }
        catch (error) {
            logger_1.default.error(`❌ Trade execution failed for ${trade.slug || trade.asset}: ${error}`);
            logger_1.default.warning('🔄 Resetting trade for retry on next cycle...');
            try {
                await (0, persistence_1.resetTradeForRetry)(trade);
            }
            catch (dbError) {
                logger_1.default.error(`Failed to reset trade status: ${dbError}`);
            }
            logger_1.default.separator();
        }
    }
};
exports.executeTraderTrades = executeTraderTrades;
const executeTraderAggregations = async (clobClient, _userAddress, aggregatedTrades, deps) => {
    for (const aggregation of aggregatedTrades) {
        try {
            logger_1.default.header(`📊 AGGREGATED TRADE (${aggregation.trades.length} trades combined)`);
            logger_1.default.info(`Market: ${aggregation.slug || aggregation.asset} | Side: ${aggregation.side} | Volume: $${aggregation.totalUsdcSize.toFixed(2)} | Avg price: $${aggregation.averagePrice.toFixed(4)}`);
            for (const trade of aggregation.trades) {
                await (0, persistence_1.markTradeAsProcessing)(trade);
            }
            const context = await fetchExecutionContext(aggregation.userAddress, aggregation.conditionId, aggregation.asset);
            logger_1.default.balance(context.myBalance, context.userBalance, aggregation.userAddress);
            if (aggregation.side === 'BUY' && context.myBalance < 1) {
                logger_1.default.warning(`⚠️ Insufficient balance ($${context.myBalance.toFixed(2)}) - skipping aggregated buy`);
                await markInsufficientBalanceTrades(aggregation.trades);
                continue;
            }
            const totalTokens = aggregation.trades.reduce((sum, trade) => sum + (trade.size || 0), 0);
            const syntheticTrade = {
                ...aggregation.trades[0],
                usdcSize: aggregation.totalUsdcSize,
                size: totalTokens,
                price: aggregation.averagePrice,
                side: aggregation.side,
            };
            await (0, postOrder_1.default)(clobClient, aggregation.side === 'BUY' ? 'buy' : 'sell', context.myPosition, context.userPosition, syntheticTrade, context.myBalance, context.userBalance, aggregation.userAddress, context.myPositions, context.userPositions);
            try {
                await (0, persistence_1.applySyntheticTradeStatus)(aggregation.trades, syntheticTrade);
            }
            catch (dbError) {
                logger_1.default.error(`Failed to apply aggregated trade status: ${dbError}`);
            }
            logger_1.default.separator();
        }
        catch (error) {
            logger_1.default.error(`❌ Aggregated trade execution failed for ${aggregation.slug || aggregation.asset}: ${error}`);
            logger_1.default.warning('⚠️ Stopping retries for this aggregated group to prevent infinite loop.');
            for (const trade of aggregation.trades) {
                try {
                    await (0, persistence_1.markTradeStatus)(trade.userAddress, trade._id, {
                        $set: {
                            bot: true,
                            buyStatus: 'EXECUTION_FAILED',
                            sellStatus: 'EXECUTION_FAILED',
                        },
                    });
                }
                catch (dbError) {
                    logger_1.default.error(`Failed to set failed status: ${dbError}`);
                }
            }
            logger_1.default.separator();
        }
    }
};
exports.executeTraderAggregations = executeTraderAggregations;
