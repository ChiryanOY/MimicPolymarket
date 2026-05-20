import { AssetType, ClobClient, OrderType, Side } from '@polymarket/clob-client-v2';
import { getStrategyForTrader } from '../../config/mimicStrategy';
import { UserActivityInterface } from '../../interfaces/User';
import { getUserActivityModel } from '../../models/userHistory';
import { myStateManager } from '../../services/myStateManager';
import Logger from '../logger';
import { getRealBalance } from './balance';
import { cancelBuyOrdersForAsset } from './orders';
import {
    clampPrice,
    MIMIC_STRATEGY_CONFIG,
    extractOrderError,
    isFokFillError,
    isPermanentOrderError,
    RETRY_LIMIT,
    roundPriceTo2Decimals,
    roundTokensTo2Decimals,
    SELL_SLIPPAGE_THRESHOLD,
    TRADER_STRATEGIES_MAP,
} from './shared';

export const executeSellOrder = async (
    clobClient: ClobClient,
    trade: UserActivityInterface,
    _myPosition: unknown,
    userPosition: { size?: string | number } | undefined,
    userAddress: string
): Promise<void> => {
    const userActivity = getUserActivityModel(userAddress);
    const traderStrategy = getStrategyForTrader(
        userAddress,
        TRADER_STRATEGIES_MAP,
        MIMIC_STRATEGY_CONFIG
    );

    Logger.info('Executing SELL strategy...');
    let remaining = 0;

    Logger.info('🔍 Checking for pending BUY orders before selling...');
    const cancelResult = await cancelBuyOrdersForAsset(clobClient, trade.asset);
    if (cancelResult.cancelled > 0) {
        if (cancelResult.success) {
            Logger.success(
                `✅ Cancelled ${cancelResult.cancelled} pending BUY order(s) before selling`
            );
        } else {
            Logger.warning(
                `⚠️ Partially cancelled ${cancelResult.cancelled} BUY order(s), some orders may still be pending`
            );
            Logger.warning('⚠️ Proceeding with sell operation anyway...');
        }
    } else {
        Logger.info('✅ No pending BUY orders found');
    }

    Logger.info(`🔍 Fetching real-time CLOB token balance for ${trade.asset}...`);
    try {
        await clobClient.updateBalanceAllowance({
            asset_type: AssetType.CONDITIONAL,
            token_id: trade.asset,
        });
        Logger.info('✅ Polymarket token balance cache updated');
    } catch (cacheError) {
        Logger.warning(`⚠️ Failed to update Polymarket balance cache: ${cacheError}`);
    }

    const realClobBalance = await getRealBalance(clobClient, AssetType.CONDITIONAL, trade.asset);
    let clobTokenBalance = 0;

    if (realClobBalance !== null) {
        clobTokenBalance = realClobBalance;
        Logger.info(`✅ Real CLOB balance retrieved: ${clobTokenBalance.toFixed(4)} tokens`);
    } else {
        const myPosState = myStateManager.getPosition(trade.asset) as
            | { size?: string | number }
            | undefined;
        clobTokenBalance = myPosState ? parseFloat(String(myPosState.size || '0')) : 0;
        Logger.warning(
            `⚠️ Failed to get real CLOB balance, falling back to local state: ${clobTokenBalance.toFixed(4)} tokens`
        );
    }

    if (clobTokenBalance <= 0.001) {
        Logger.warning('No position to sell (verified in memory)');
        trade.bot = true;
        trade.sellStatus = 'NO_POSITION';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'NO_POSITION' });
        return;
    }

    const myPositionSize = clobTokenBalance;
    if (!userPosition || parseFloat(String(userPosition.size || '0')) <= 0.001) {
        remaining = myPositionSize;
        Logger.info(
            `Trader closed entire position (or position not found) → Selling all your ${remaining.toFixed(2)} tokens`
        );
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

        Logger.info(
            `Position comparison: Trader API size ${userPosSize.toFixed(2)} tokens, You have ${myPositionSize.toFixed(2)} tokens`
        );
        Logger.info(
            `Trader selling: ${trade.size.toFixed(2)} tokens (${(traderSellPercent * 100).toFixed(2)}% of their position)`
        );

        remaining = myPositionSize * traderSellPercent;
        Logger.info(
            `Calculating sell: ${myPositionSize.toFixed(2)} × ${(traderSellPercent * 100).toFixed(2)}% = ${remaining.toFixed(2)} tokens`
        );
    }

    remaining = roundTokensTo2Decimals(remaining);
    if (remaining > clobTokenBalance) {
        Logger.warning(
            `⚠️ Calculated sell amount (${remaining.toFixed(2)}) > available balance (${clobTokenBalance.toFixed(4)}).`
        );
        Logger.warning('📉 Adjusting sell amount down to actual available tokens.');
        remaining = clobTokenBalance;
    }

    remaining = roundTokensTo2Decimals(remaining);
    if (remaining < 0.01) {
        Logger.warning(
            '🚫 Available balance is 0 (or too small). Skipping sell operation to avoid rejection.'
        );
        trade.bot = true;
        trade.sellStatus = 'INSUFFICIENT_BALANCE';
        await userActivity.updateOne(
            { _id: trade._id },
            { bot: true, sellStatus: 'INSUFFICIENT_BALANCE' }
        );
        return;
    }

    let retry = 0;
    let totalSoldTokens = 0;

    while (remaining > 0 && retry < RETRY_LIMIT) {
        if (retry > 0) {
            const retryRealBalance = await getRealBalance(
                clobClient,
                AssetType.CONDITIONAL,
                trade.asset
            );

            if (retryRealBalance !== null) {
                clobTokenBalance = retryRealBalance;
                Logger.info(
                    `✅ Retry real CLOB balance retrieved: ${clobTokenBalance.toFixed(4)} tokens`
                );
            } else {
                const currentMyPos = myStateManager.getPosition(trade.asset) as
                    | { size?: string | number }
                    | undefined;
                clobTokenBalance = currentMyPos ? parseFloat(String(currentMyPos.size || '0')) : 0;
            }

            if (remaining > clobTokenBalance) {
                Logger.warning(
                    `⚠️ Available balance dropped to ${clobTokenBalance.toFixed(4)} during retry. Adjusting sell amount.`
                );
                remaining = roundTokensTo2Decimals(clobTokenBalance);
                if (remaining < 0.01) {
                    Logger.warning('🚫 Available balance depleted during retry. Stopping.');
                    break;
                }
            }
        }

        const orderAmount = remaining;
        let orderBook;
        try {
            orderBook = await clobClient.getOrderBook(trade.asset);
        } catch (error) {
            const orderBookError = error as {
                message?: string;
                response?: { data?: { error?: string }; status?: number };
            };
            const errorData = orderBookError.response?.data;
            const errorStatus = orderBookError.response?.status;

            if (
                errorStatus === 404 ||
                (errorData?.error && errorData.error.includes('No orderbook exists'))
            ) {
                Logger.error(`🚫 Market closed or does not exist for token ${trade.asset}`);
                trade.bot = true;
                trade.sellStatus = 'MARKET_CLOSED';
                await userActivity.updateOne(
                    { _id: trade._id },
                    { bot: true, sellStatus: 'MARKET_CLOSED' }
                );
                return;
            }

            retry += 1;
            Logger.warning(
                `Order book fetch error (attempt ${retry}/${RETRY_LIMIT}): ${orderBookError.message || orderBookError}`
            );
            continue;
        }

        if (!orderBook.bids || orderBook.bids.length === 0) {
            Logger.warning('No bids available in order book');
            trade.bot = true;
            trade.sellStatus = 'NO_BIDS';
            await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'NO_BIDS' });
            break;
        }

        const maxPriceBid = orderBook.bids.reduce((max, bid) => {
            return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
        }, orderBook.bids[0]);

        const rawBidPrice = parseFloat(maxPriceBid.price);
        const effectiveSellSlippageThreshold =
            traderStrategy.sellSlippageThreshold ?? SELL_SLIPPAGE_THRESHOLD;
        const priceWithSlippage = Math.max(0.01, rawBidPrice - effectiveSellSlippageThreshold);
        const limitPrice = clampPrice(roundPriceTo2Decimals(priceWithSlippage, true));

        Logger.info(
            `Best bid: $${rawBidPrice.toFixed(4)} → slippage adjusted limit price: $${limitPrice.toFixed(2)}`
        );

        const sellAmount = roundTokensTo2Decimals(orderAmount);
        const orderArgs = {
            side: Side.SELL,
            tokenID: trade.asset,
            amount: sellAmount,
            price: limitPrice,
        };

        try {
            const signedOrder = await clobClient.createMarketOrder(orderArgs);
            const response = await clobClient.postOrder(signedOrder, OrderType.FOK);

            if (response.success === true) {
                retry = 0;
                totalSoldTokens += orderArgs.amount;
                Logger.orderResult(
                    true,
                    `Sold ${orderArgs.amount.toFixed(2)} tokens at $${orderArgs.price}`
                );
                remaining -= orderArgs.amount;
                continue;
            }

            const errorMessage = extractOrderError(response);
            if (isPermanentOrderError(errorMessage)) {
                Logger.error(
                    `🚫 Permanent error - market closed or does not exist: ${errorMessage}`
                );
                trade.bot = true;
                trade.sellStatus = 'MARKET_CLOSED';
                await userActivity.updateOne(
                    { _id: trade._id },
                    { bot: true, sellStatus: 'MARKET_CLOSED' }
                );
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }

            if (isFokFillError(errorMessage)) {
                Logger.warning(
                    `🔄 FOK order not fully filled due to market changes: ${errorMessage}. Retrying...`
                );
                retry += 1;
                continue;
            }

            const isNetworkError = !errorMessage && (!response || response.status === undefined);
            if (!isNetworkError) {
                Logger.error(
                    `🚫 Order rejected by exchange: ${errorMessage || JSON.stringify(response)}`
                );
                trade.bot = true;
                trade.sellStatus = 'EXCHANGE_REJECTED';
                await userActivity.updateOne(
                    { _id: trade._id },
                    { bot: true, sellStatus: 'EXCHANGE_REJECTED' }
                );
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }

            retry += 1;
            Logger.warning(
                `Order failed (network/unknown error, attempt ${retry}/${RETRY_LIMIT})${errorMessage ? ` - ${errorMessage}` : ''}`
            );
        } catch (error) {
            const errorStr = String(error);
            const errorMessage = extractOrderError(error);

            if (isPermanentOrderError(errorStr) || isPermanentOrderError(errorMessage)) {
                Logger.error(`🚫 Permanent error - market closed or does not exist: ${errorStr}`);
                trade.bot = true;
                trade.sellStatus = 'MARKET_CLOSED';
                await userActivity.updateOne(
                    { _id: trade._id },
                    { bot: true, sellStatus: 'MARKET_CLOSED' }
                );
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }

            if (isFokFillError(errorStr) || isFokFillError(errorMessage)) {
                Logger.warning(
                    `🔄 FOK order not fully filled due to market changes: ${errorMessage || errorStr}. Retrying...`
                );
                retry += 1;
                continue;
            }

            const isNetworkError =
                errorStr.includes('timeout') ||
                errorStr.includes('ECONN') ||
                errorStr.includes('network') ||
                errorStr.includes('socket') ||
                errorStr.includes('EAI_AGAIN') ||
                (!!errorMessage &&
                    (errorMessage.includes('timeout') ||
                        errorMessage.includes('network') ||
                        errorMessage.includes('ECONN')));

            if (!isNetworkError && (errorMessage || errorStr.includes('status code'))) {
                Logger.error(`🚫 Order rejected by exchange: ${errorMessage || errorStr}`);
                trade.bot = true;
                trade.sellStatus = 'EXCHANGE_REJECTED';
                await userActivity.updateOne(
                    { _id: trade._id },
                    { bot: true, sellStatus: 'EXCHANGE_REJECTED' }
                );
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }

            retry += 1;
            Logger.error(`Order network error (attempt ${retry}/${RETRY_LIMIT}): ${error}`);
        }
    }

    if (retry >= RETRY_LIMIT) {
        trade.bot = true;
        trade.sellStatus = 'RETRY_LIMIT_REACHED';
        await userActivity.updateOne(
            { _id: trade._id },
            {
                bot: true,
                botExcutedTime: retry,
                sellStatus: 'RETRY_LIMIT_REACHED',
            }
        );
        return;
    }

    trade.bot = true;
    if (totalSoldTokens > 0) {
        trade.sellStatus = 'SUCCESS';
        Logger.success(`✅ Sell completed: ${totalSoldTokens.toFixed(2)} tokens sold`);
    }
    await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: trade.sellStatus });
};
