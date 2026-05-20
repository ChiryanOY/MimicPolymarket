import { ClobClient, Side } from '@polymarket/clob-client-v2';
import { getStrategyForTrader } from '../../config/mimicStrategy';
import { UserActivityInterface } from '../../interfaces/User';
import { getUserActivityModel } from '../../models/userHistory';
import Logger from '../logger';
import { handleExecutionError, placeLimitOrder } from './orders';
import {
    BUY_SLIPPAGE_THRESHOLD,
    clampPrice,
    formatTokenAmount,
    MIMIC_STRATEGY_CONFIG,
    roundPriceTo2Decimals,
    TRADER_STRATEGIES_MAP,
} from './shared';

export const executeBuyOrder = async (
    clobClient: ClobClient,
    trade: UserActivityInterface,
    myBalance: number,
    userAddress: string,
    myPositions?: unknown[]
): Promise<void> => {
    const userActivity = getUserActivityModel(userAddress);
    const traderStrategy = getStrategyForTrader(
        userAddress,
        TRADER_STRATEGIES_MAP,
        MIMIC_STRATEGY_CONFIG
    );

    Logger.info('Executing BUY strategy (Token-based)...');
    Logger.info(`Your balance: $${myBalance.toFixed(2)}`);
    Logger.info(
        `Trader bought: ${trade.size.toFixed(2)} tokens @ $${trade.price.toFixed(4)} ($${trade.usdcSize.toFixed(2)})`
    );

    if (TRADER_STRATEGIES_MAP.has(userAddress.toLowerCase())) {
        Logger.info(
            `📋 Using custom settings for trader: ${traderStrategy.mimicSize}%`
        );
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
        const positions = (myPositions || []) as Array<{
            conditionId?: string;
            asset?: string;
            initialValue?: string | number;
        }>;
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

            if (allowedTokens < 5) {
                Logger.warning(
                    `❌ Cannot execute: Position cost limit ($${traderStrategy.maxPositionSizeUSD}) reached (Current cost: $${currentPositionCost.toFixed(2)})`
                );
                trade.bot = true;
                trade.buyStatus = 'POSITION_LIMIT_REACHED';
                await userActivity.updateOne(
                    { _id: trade._id },
                    { bot: true, buyStatus: 'POSITION_LIMIT_REACHED' }
                );
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
    Logger.info(`📊 ${reasoning}`);

    const effectiveSlippageThreshold =
        traderStrategy.buySlippageThreshold ?? BUY_SLIPPAGE_THRESHOLD;
    const rawLimitPrice = Math.min(trade.price + effectiveSlippageThreshold, 0.99);
    const limitPrice = clampPrice(roundPriceTo2Decimals(rawLimitPrice, false));

    Logger.info(
        `📊 Using strict limit price: $${limitPrice.toFixed(4)} (Trader price: $${trade.price.toFixed(4)} + Max slippage: $${effectiveSlippageThreshold.toFixed(4)})`
    );

    const result = await placeLimitOrder(
        clobClient,
        trade.asset,
        Side.BUY,
        tokensToOrder,
        rawLimitPrice
    );

    if (await handleExecutionError(userAddress, trade, result.status, false)) {
        return;
    }
    if (result.status === 'INSUFFICIENT_BALANCE') {
        Logger.warning('Order rejected: Insufficient balance or allowance');
        trade.bot = true;
        trade.buyStatus = 'INSUFFICIENT_BALANCE';
        await userActivity.updateOne(
            { _id: trade._id },
            { bot: true, buyStatus: 'INSUFFICIENT_BALANCE' }
        );
        return;
    }
    if (result.status === 'BELOW_MIN_NOTIONAL') {
        trade.bot = true;
        trade.buyStatus = 'BELOW_MIN_NOTIONAL';
        await userActivity.updateOne(
            { _id: trade._id },
            { bot: true, buyStatus: 'BELOW_MIN_NOTIONAL' }
        );
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
        Logger.orderResult(
            true,
            `${result.orderType || 'BUY'} limit order placed: ${formatTokenAmount(result.filledSize)} tokens @ $${limitPrice.toFixed(4)}`
        );
        Logger.info('📝 Limit order placed.');
    } else if (!result.success) {
        Logger.warning(`⚠️ ${(result.orderType || 'BUY')} limit order failed: ${result.status}`);
    }
};
