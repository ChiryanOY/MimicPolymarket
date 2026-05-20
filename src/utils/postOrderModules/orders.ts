import { ClobClient, OrderType, Side } from '@polymarket/clob-client-v2';
import { UserActivityInterface } from '../../interfaces/User';
import { getUserActivityModel } from '../../models/userHistory';
import Logger from '../logger';
import {
    alignMarketBuyOrder,
    clampPrice,
    extractOrderError,
    formatTokenAmount,
    isInsufficientBalanceOrAllowanceError,
    isPermanentOrderError,
    roundPriceTo2Decimals,
    roundTokensTo4Decimals,
} from './shared';
import { LimitOrderResult } from './types';

const CANCEL_RETRY_LIMIT = 3;
const CANCEL_RETRY_DELAY_MS = 1000;

export const getOpenBuyOrdersForAsset = async (
    clobClient: ClobClient,
    assetId: string
): Promise<{ orderID: string; size: number; price: number }[]> => {
    try {
        const getOrders = (
            clobClient as {
                getOpenOrders?: (_params?: { asset_id?: string }) => Promise<unknown>;
            }
        ).getOpenOrders;
        if (typeof getOrders !== 'function') {
            Logger.warning('getOpenOrders method not available on clobClient');
            return [];
        }

        const raw = await getOrders.call(clobClient, { asset_id: assetId });
        let orderList: unknown[] = [];

        if (Array.isArray(raw)) {
            orderList = raw;
        } else if (raw && typeof raw === 'object') {
            const rawObj = raw as Record<string, unknown>;
            if (Array.isArray(rawObj.data)) {
                orderList = rawObj.data;
            } else if (Array.isArray(rawObj.orders)) {
                orderList = rawObj.orders;
            }
        }

        const buyOrders: { orderID: string; size: number; price: number }[] = [];
        for (const order of orderList) {
            const data = order as Record<string, unknown>;
            const side = String(data.side || '').toUpperCase();
            if (side !== 'BUY') {
                continue;
            }

            const orderID = String(data.order_id || data.orderID || data.id || '');
            const originalSize = parseFloat(
                String(data.original_size ?? data.originalSize ?? data.size ?? 0)
            );
            const matchedSize = parseFloat(String(data.size_matched ?? data.sizeMatched ?? 0));
            const remainingSize = Math.max(0, originalSize - matchedSize);
            const price = parseFloat(String(data.price ?? 0));

            if (orderID && remainingSize > 0) {
                buyOrders.push({
                    orderID,
                    size: remainingSize,
                    price,
                });
            }
        }

        return buyOrders;
    } catch (error) {
        Logger.warning(`Failed to get open orders for asset ${assetId.slice(0, 10)}...: ${error}`);
        return [];
    }
};

export const cancelBuyOrdersForAsset = async (
    clobClient: ClobClient,
    assetId: string
): Promise<{ cancelled: number; success: boolean }> => {
    let buyOrders = await getOpenBuyOrdersForAsset(clobClient, assetId);

    if (buyOrders.length === 0) {
        return { cancelled: 0, success: true };
    }

    Logger.info(`🔍 Found ${buyOrders.length} open BUY order(s) for this asset`);
    for (const order of buyOrders) {
        Logger.info(
            `   📋 Order ${order.orderID.slice(0, 12)}...: ${order.size.toFixed(2)} tokens @ $${order.price.toFixed(4)}`
        );
    }

    const initialOrderCount = buyOrders.length;

    for (let attempt = 1; attempt <= CANCEL_RETRY_LIMIT; attempt++) {
        try {
            Logger.info(`🚫 Cancelling BUY orders (attempt ${attempt}/${CANCEL_RETRY_LIMIT})...`);

            const cancelMarketOrders = (
                clobClient as {
                    cancelMarketOrders?: (_params: { asset_id: string }) => Promise<unknown>;
                }
            ).cancelMarketOrders;

            let cancelAttempted = false;

            if (typeof cancelMarketOrders === 'function') {
                try {
                    const response = await cancelMarketOrders.call(clobClient, {
                        asset_id: assetId,
                    });
                    cancelAttempted = true;
                    Logger.info(`   Cancel response: ${JSON.stringify(response)}`);
                } catch (bulkError) {
                    Logger.warning(`   Bulk cancel failed: ${bulkError}`);
                }
            }

            if (!cancelAttempted || buyOrders.length > 0) {
                const cancelOrders = (
                    clobClient as { cancelOrders?: (_ids: string[]) => Promise<unknown> }
                ).cancelOrders;

                if (typeof cancelOrders === 'function' && buyOrders.length > 0) {
                    const orderIds = buyOrders.map((order) => order.orderID);
                    try {
                        Logger.info(`   Cancelling ${orderIds.length} order(s) individually...`);
                        const response = await cancelOrders.call(clobClient, orderIds);
                        Logger.info(`   Individual cancel response: ${JSON.stringify(response)}`);
                    } catch (individualError) {
                        Logger.warning(`   Individual cancel failed: ${individualError}`);
                    }
                }
            }

            const remainingOrders = await getOpenBuyOrdersForAsset(clobClient, assetId);
            const cancelledThisRound = buyOrders.length - remainingOrders.length;

            if (remainingOrders.length === 0) {
                Logger.success(`✅ Successfully cancelled all ${initialOrderCount} BUY order(s)`);
                return { cancelled: initialOrderCount, success: true };
            }

            buyOrders = remainingOrders;
            if (cancelledThisRound > 0) {
                Logger.info(
                    `   Cancelled ${cancelledThisRound} order(s), ${remainingOrders.length} remaining`
                );
            }

            if (attempt < CANCEL_RETRY_LIMIT) {
                Logger.warning(
                    `   ${remainingOrders.length} order(s) still pending, retrying in ${CANCEL_RETRY_DELAY_MS}ms...`
                );
                await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_DELAY_MS));
            }
        } catch (error) {
            Logger.warning(`   Cancel attempt ${attempt} error: ${error}`);
            if (attempt < CANCEL_RETRY_LIMIT) {
                await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_DELAY_MS));
            }
        }
    }

    const finalRemainingOrders = await getOpenBuyOrdersForAsset(clobClient, assetId);
    if (finalRemainingOrders.length === 0) {
        Logger.success('✅ All BUY orders cancelled after retries');
        return { cancelled: initialOrderCount, success: true };
    }

    const finallyCancelled = initialOrderCount - finalRemainingOrders.length;
    if (finallyCancelled > 0) {
        Logger.warning(
            `⚠️ Partially cancelled: ${finallyCancelled}/${initialOrderCount} orders, ${finalRemainingOrders.length} still pending`
        );
        return { cancelled: finallyCancelled, success: false };
    }

    Logger.error(`❌ Failed to cancel BUY orders after ${CANCEL_RETRY_LIMIT} attempts`);
    return { cancelled: 0, success: false };
};

export const placeLimitOrder = async (
    clobClient: ClobClient,
    tokenID: string,
    side: Side,
    tokensToOrder: number,
    initialLimitPrice: number
): Promise<LimitOrderResult> => {
    let limitPrice = initialLimitPrice;
    limitPrice = clampPrice(roundPriceTo2Decimals(limitPrice, false));
    const roundedTokens = roundTokensTo4Decimals(tokensToOrder);
    const { adjustedTokens, usdcAmount, stepTokens } = alignMarketBuyOrder(roundedTokens, limitPrice);
    const orderType =
        usdcAmount < 1 ? (adjustedTokens > 5 ? OrderType.GTC : undefined) : OrderType.FOK;
    const orderTypeLabel = orderType === OrderType.GTC ? 'GTC' : 'FOK';

    if (adjustedTokens !== roundedTokens || roundedTokens !== tokensToOrder || limitPrice !== initialLimitPrice) {
        Logger.info(
            `📐 Precision adjusted: ${formatTokenAmount(tokensToOrder)} tokens @ $${initialLimitPrice.toFixed(6)} → ${formatTokenAmount(adjustedTokens)} tokens @ $${limitPrice.toFixed(2)} (USDC: $${usdcAmount.toFixed(2)})`
        );
    }

    if (adjustedTokens <= 0) {
        Logger.warning(
            `❌ Cannot place buy order: marketable buy precision requires token steps of ${formatTokenAmount(stepTokens)} at price $${limitPrice.toFixed(2)}`
        );
        return {
            filledSize: 0,
            status: 'BELOW_MIN_NOTIONAL',
            success: false,
        };
    }

    if (!orderType) {
        Logger.warning(
            `❌ Cannot place buy order: notional $${usdcAmount.toFixed(2)} is below $1 and token size ${formatTokenAmount(adjustedTokens)} is not greater than 5`
        );
        return {
            filledSize: 0,
            status: 'BELOW_MIN_NOTIONAL',
            success: false,
        };
    }

    if (orderType === OrderType.GTC) {
        Logger.info(
            `📋 Using GTC because buy notional is below $1 but token size is ${formatTokenAmount(adjustedTokens)} (> 5)`
        );
    }

    try {
        const signedOrder = await clobClient.createOrder({
            side,
            tokenID,
            size: adjustedTokens,
            price: limitPrice,
        });
        const response = await clobClient.postOrder(signedOrder, orderType);
        if (response.success && response.orderID) {
            Logger.success(
                `✅ ${orderTypeLabel} limit order placed: ${formatTokenAmount(adjustedTokens)} tokens @ $${limitPrice.toFixed(4)}`
            );
            Logger.info(`Order ID: ${response.orderID}`);
            return {
                filledSize: adjustedTokens,
                status: 'PLACED',
                orderID: response.orderID,
                orderType: orderTypeLabel,
                success: true,
            };
        }

        const errorMsg = extractOrderError(response) || 'Unknown error';
        if (isPermanentOrderError(errorMsg)) {
            if (errorMsg.toLowerCase().includes('deposit wallet flow')) {
                const missingConfig: string[] = [];
                if (!process.env.TRADING_WALLET) missingConfig.push('TRADING_WALLET');
                if ((process.env.WALLET_MODE || '').toUpperCase() !== 'DEPOSIT') {
                    missingConfig.push("WALLET_MODE='DEPOSIT'");
                }
                if (!process.env.POLY_BUILDER_CODE) missingConfig.push('POLY_BUILDER_CODE');
                if (!process.env.POLY_BUILDER_API_KEY) missingConfig.push('POLY_BUILDER_API_KEY');
                if (!process.env.POLY_BUILDER_API_SECRET) missingConfig.push('POLY_BUILDER_API_SECRET');
                if (!process.env.POLY_BUILDER_API_PASSPHRASE) {
                    missingConfig.push('POLY_BUILDER_API_PASSPHRASE');
                }
                Logger.error(
                    `🚫 Deposit wallet flow required. ${missingConfig.length > 0 ? `Missing config: ${missingConfig.join(', ')}` : 'Initialize deposit wallet mode and retry.'}`
                );
            }
            Logger.error(`🚫 Permanent order error (no retry): ${errorMsg}`);
            return {
                filledSize: 0,
                status: 'PERMANENT_ERROR',
                orderType: orderTypeLabel,
                success: false,
            };
        }
        if (isInsufficientBalanceOrAllowanceError(errorMsg)) {
            Logger.warning(`⚠️ Insufficient balance/allowance: ${errorMsg}`);
            return {
                filledSize: 0,
                status: 'INSUFFICIENT_BALANCE',
                orderType: orderTypeLabel,
                success: false,
            };
        }

        Logger.warning(`${orderTypeLabel} limit order failed: ${errorMsg}`);
        return { filledSize: 0, status: 'FAILED', orderType: orderTypeLabel, success: false };
    } catch (error) {
        const errorStr = String(error);
        if (isPermanentOrderError(errorStr)) {
            Logger.error(`🚫 Permanent order error (no retry): ${errorStr}`);
            return {
                filledSize: 0,
                status: 'PERMANENT_ERROR',
                orderType: orderTypeLabel,
                success: false,
            };
        }
        if (isInsufficientBalanceOrAllowanceError(errorStr)) {
            Logger.warning(`⚠️ Insufficient balance/allowance: ${errorStr}`);
            return {
                filledSize: 0,
                status: 'INSUFFICIENT_BALANCE',
                orderType: orderTypeLabel,
                success: false,
            };
        }

        Logger.error(`Failed to place ${orderTypeLabel} limit order: ${error}`);
        return { filledSize: 0, status: 'FAILED', orderType: orderTypeLabel, success: false };
    }
};

export const handleExecutionError = async (
    userAddress: string,
    trade: UserActivityInterface,
    errorMsg: string,
    isSell: boolean = false
): Promise<boolean> => {
    if (!isPermanentOrderError(errorMsg)) {
        return false;
    }

    Logger.error(`🚫 Permanent error - market closed or does not exist: ${errorMsg}`);
    Logger.warning('Skipping order (no retry for closed markets)');

    const userActivity = getUserActivityModel(userAddress);
    trade.bot = true;
    if (isSell) {
        trade.sellStatus = 'MARKET_CLOSED';
        await userActivity.updateOne(
            { _id: trade._id },
            { bot: true, sellStatus: 'MARKET_CLOSED' }
        );
        return true;
    }

    trade.buyStatus = 'MARKET_CLOSED';
    await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: 'MARKET_CLOSED' });
    return true;
};
