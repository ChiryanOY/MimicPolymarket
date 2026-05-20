"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeBuyOrder = void 0;
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const mimicStrategy_1 = require("../../config/mimicStrategy");
const userHistory_1 = require("../../models/userHistory");
const logger_1 = __importDefault(require("../logger"));
const orders_1 = require("./orders");
const shared_1 = require("./shared");
const executeBuyOrder = async (clobClient, trade, myBalance, userAddress, myPositions) => {
    const userActivity = (0, userHistory_1.getUserActivityModel)(userAddress);
    const traderStrategy = (0, mimicStrategy_1.getStrategyForTrader)(userAddress, shared_1.TRADER_STRATEGIES_MAP, shared_1.MIMIC_STRATEGY_CONFIG);
    logger_1.default.info('Executing BUY strategy (Token-based)...');
    logger_1.default.info(`Your balance: $${myBalance.toFixed(2)}`);
    logger_1.default.info(`Trader bought: ${trade.size.toFixed(2)} tokens @ $${trade.price.toFixed(4)} ($${trade.usdcSize.toFixed(2)})`);
    if (shared_1.TRADER_STRATEGIES_MAP.has(userAddress.toLowerCase())) {
        logger_1.default.info(`📋 Using custom settings for trader: ${traderStrategy.mimicSize}%`);
    }
    const baseTokens = trade.size * (traderStrategy.mimicSize / 100);
    let tokensToOrder = baseTokens;
    let reasoning = `${traderStrategy.mimicSize}% of trader's ${trade.size.toFixed(2)} tokens = ${baseTokens.toFixed(2)} tokens`;
    const maxTokensByOrderLimit = traderStrategy.maxOrderSizeUSD / trade.price;
    if (tokensToOrder > maxTokensByOrderLimit) {
        reasoning += ` → Capped at max order: ${tokensToOrder.toFixed(2)} → ${maxTokensByOrderLimit.toFixed(2)} tokens`;
        tokensToOrder = maxTokensByOrderLimit;
    }
    if (traderStrategy.maxPositionSizeUSD !== undefined && traderStrategy.maxPositionSizeUSD > 0) {
        const positions = (myPositions || []);
        const latestPosition = positions.find((position) => position.conditionId === trade.conditionId && position.asset === trade.asset);
        const currentPositionCost = latestPosition
            ? parseFloat(String(latestPosition.initialValue || '0'))
            : 0;
        const newTotalPositionCost = currentPositionCost + tokensToOrder * trade.price;
        if (newTotalPositionCost > traderStrategy.maxPositionSizeUSD) {
            const allowedValue = Math.max(0, traderStrategy.maxPositionSizeUSD - currentPositionCost);
            const allowedTokens = allowedValue / trade.price;
            if (allowedTokens < 5) {
                logger_1.default.warning(`❌ Cannot execute: Position cost limit ($${traderStrategy.maxPositionSizeUSD}) reached (Current cost: $${currentPositionCost.toFixed(2)})`);
                trade.bot = true;
                trade.buyStatus = 'POSITION_LIMIT_REACHED';
                await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: 'POSITION_LIMIT_REACHED' });
                return;
            }
            reasoning += ` → Reduced to fit position cost limit ($${traderStrategy.maxPositionSizeUSD}): ${tokensToOrder.toFixed(2)} → ${allowedTokens.toFixed(2)} tokens`;
            tokensToOrder = allowedTokens;
        }
    }
    const maxAffordableTokens = (myBalance * 0.99) / trade.price;
    if (tokensToOrder > maxAffordableTokens) {
        reasoning += ` → Reduced to fit balance: ${tokensToOrder.toFixed(2)} → ${maxAffordableTokens.toFixed(2)} tokens`;
        tokensToOrder = maxAffordableTokens;
    }
    if (tokensToOrder < 5) {
        reasoning += ' → Below market order minimum (5 tokens)';
    }
    logger_1.default.info(`📊 ${reasoning}`);
    const effectiveSlippageThreshold = traderStrategy.buySlippageThreshold ?? shared_1.BUY_SLIPPAGE_THRESHOLD;
    const rawLimitPrice = Math.min(trade.price + effectiveSlippageThreshold, 0.99);
    const limitPrice = (0, shared_1.clampPrice)((0, shared_1.roundPriceTo2Decimals)(rawLimitPrice, false));
    logger_1.default.info(`📊 Using strict limit price: $${limitPrice.toFixed(4)} (Trader price: $${trade.price.toFixed(4)} + Max slippage: $${effectiveSlippageThreshold.toFixed(4)})`);
    const result = await (0, orders_1.placeLimitOrder)(clobClient, trade.asset, clob_client_v2_1.Side.BUY, tokensToOrder, rawLimitPrice);
    if (await (0, orders_1.handleExecutionError)(userAddress, trade, result.status, false)) {
        return;
    }
    if (result.status === 'INSUFFICIENT_BALANCE') {
        logger_1.default.warning('Order rejected: Insufficient balance or allowance');
        trade.bot = true;
        trade.buyStatus = 'INSUFFICIENT_BALANCE';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: 'INSUFFICIENT_BALANCE' });
        return;
    }
    if (result.status === 'BELOW_MIN_NOTIONAL') {
        trade.bot = true;
        trade.buyStatus = 'BELOW_MIN_NOTIONAL';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: 'BELOW_MIN_NOTIONAL' });
        return;
    }
    if (result.status === 'PERMANENT_ERROR') {
        trade.bot = true;
        trade.buyStatus = 'PERMANENT_ERROR';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: 'PERMANENT_ERROR' });
        return;
    }
    trade.bot = true;
    trade.buyStatus = result.success ? 'SUCCESS' : 'FAILED';
    await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: trade.buyStatus });
    if (result.success && result.orderID) {
        logger_1.default.orderResult(true, `${result.orderType || 'BUY'} limit order placed: ${(0, shared_1.formatTokenAmount)(result.filledSize)} tokens @ $${limitPrice.toFixed(4)}`);
        logger_1.default.info('📝 Limit order placed.');
    }
    else if (!result.success) {
        logger_1.default.warning(`⚠️ ${(result.orderType || 'BUY')} limit order failed: ${result.status}`);
    }
};
exports.executeBuyOrder = executeBuyOrder;
