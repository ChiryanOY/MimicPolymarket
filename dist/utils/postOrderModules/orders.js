"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleExecutionError = exports.placeLimitOrder = exports.cancelBuyOrdersForAsset = exports.getOpenBuyOrdersForAsset = void 0;
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const userHistory_1 = require("../../models/userHistory");
const logger_1 = __importDefault(require("../logger"));
const shared_1 = require("./shared");
const CANCEL_RETRY_LIMIT = 3;
const CANCEL_RETRY_DELAY_MS = 1000;
const getOpenBuyOrdersForAsset = async (clobClient, assetId) => {
    try {
        const getOrders = clobClient.getOpenOrders;
        if (typeof getOrders !== 'function') {
            logger_1.default.warning('getOpenOrders method not available on clobClient');
            return [];
        }
        const raw = await getOrders.call(clobClient, { asset_id: assetId });
        let orderList = [];
        if (Array.isArray(raw)) {
            orderList = raw;
        }
        else if (raw && typeof raw === 'object') {
            const rawObj = raw;
            if (Array.isArray(rawObj.data)) {
                orderList = rawObj.data;
            }
            else if (Array.isArray(rawObj.orders)) {
                orderList = rawObj.orders;
            }
        }
        const buyOrders = [];
        for (const order of orderList) {
            const data = order;
            const side = String(data.side || '').toUpperCase();
            if (side !== 'BUY') {
                continue;
            }
            const orderID = String(data.order_id || data.orderID || data.id || '');
            const originalSize = parseFloat(String(data.original_size ?? data.originalSize ?? data.size ?? 0));
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
    }
    catch (error) {
        logger_1.default.warning(`Failed to get open orders for asset ${assetId.slice(0, 10)}...: ${error}`);
        return [];
    }
};
exports.getOpenBuyOrdersForAsset = getOpenBuyOrdersForAsset;
const cancelBuyOrdersForAsset = async (clobClient, assetId) => {
    let buyOrders = await (0, exports.getOpenBuyOrdersForAsset)(clobClient, assetId);
    if (buyOrders.length === 0) {
        return { cancelled: 0, success: true };
    }
    logger_1.default.info(`🔍 Found ${buyOrders.length} open BUY order(s) for this asset`);
    for (const order of buyOrders) {
        logger_1.default.info(`   📋 Order ${order.orderID.slice(0, 12)}...: ${order.size.toFixed(2)} tokens @ $${order.price.toFixed(4)}`);
    }
    const initialOrderCount = buyOrders.length;
    for (let attempt = 1; attempt <= CANCEL_RETRY_LIMIT; attempt++) {
        try {
            logger_1.default.info(`🚫 Cancelling BUY orders (attempt ${attempt}/${CANCEL_RETRY_LIMIT})...`);
            const cancelMarketOrders = clobClient.cancelMarketOrders;
            let cancelAttempted = false;
            if (typeof cancelMarketOrders === 'function') {
                try {
                    const response = await cancelMarketOrders.call(clobClient, {
                        asset_id: assetId,
                    });
                    cancelAttempted = true;
                    logger_1.default.info(`   Cancel response: ${JSON.stringify(response)}`);
                }
                catch (bulkError) {
                    logger_1.default.warning(`   Bulk cancel failed: ${bulkError}`);
                }
            }
            if (!cancelAttempted || buyOrders.length > 0) {
                const cancelOrders = clobClient.cancelOrders;
                if (typeof cancelOrders === 'function' && buyOrders.length > 0) {
                    const orderIds = buyOrders.map((order) => order.orderID);
                    try {
                        logger_1.default.info(`   Cancelling ${orderIds.length} order(s) individually...`);
                        const response = await cancelOrders.call(clobClient, orderIds);
                        logger_1.default.info(`   Individual cancel response: ${JSON.stringify(response)}`);
                    }
                    catch (individualError) {
                        logger_1.default.warning(`   Individual cancel failed: ${individualError}`);
                    }
                }
            }
            const remainingOrders = await (0, exports.getOpenBuyOrdersForAsset)(clobClient, assetId);
            const cancelledThisRound = buyOrders.length - remainingOrders.length;
            if (remainingOrders.length === 0) {
                logger_1.default.success(`✅ Successfully cancelled all ${initialOrderCount} BUY order(s)`);
                return { cancelled: initialOrderCount, success: true };
            }
            buyOrders = remainingOrders;
            if (cancelledThisRound > 0) {
                logger_1.default.info(`   Cancelled ${cancelledThisRound} order(s), ${remainingOrders.length} remaining`);
            }
            if (attempt < CANCEL_RETRY_LIMIT) {
                logger_1.default.warning(`   ${remainingOrders.length} order(s) still pending, retrying in ${CANCEL_RETRY_DELAY_MS}ms...`);
                await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_DELAY_MS));
            }
        }
        catch (error) {
            logger_1.default.warning(`   Cancel attempt ${attempt} error: ${error}`);
            if (attempt < CANCEL_RETRY_LIMIT) {
                await new Promise((resolve) => setTimeout(resolve, CANCEL_RETRY_DELAY_MS));
            }
        }
    }
    const finalRemainingOrders = await (0, exports.getOpenBuyOrdersForAsset)(clobClient, assetId);
    if (finalRemainingOrders.length === 0) {
        logger_1.default.success('✅ All BUY orders cancelled after retries');
        return { cancelled: initialOrderCount, success: true };
    }
    const finallyCancelled = initialOrderCount - finalRemainingOrders.length;
    if (finallyCancelled > 0) {
        logger_1.default.warning(`⚠️ Partially cancelled: ${finallyCancelled}/${initialOrderCount} orders, ${finalRemainingOrders.length} still pending`);
        return { cancelled: finallyCancelled, success: false };
    }
    logger_1.default.error(`❌ Failed to cancel BUY orders after ${CANCEL_RETRY_LIMIT} attempts`);
    return { cancelled: 0, success: false };
};
exports.cancelBuyOrdersForAsset = cancelBuyOrdersForAsset;
const placeLimitOrder = async (clobClient, tokenID, side, tokensToOrder, initialLimitPrice) => {
    let limitPrice = initialLimitPrice;
    limitPrice = (0, shared_1.clampPrice)((0, shared_1.roundPriceTo2Decimals)(limitPrice, false));
    const roundedTokens = (0, shared_1.roundTokensTo4Decimals)(tokensToOrder);
    const { adjustedTokens, usdcAmount, stepTokens } = (0, shared_1.alignMarketBuyOrder)(roundedTokens, limitPrice);
    const orderType = usdcAmount < 1 ? (adjustedTokens > 5 ? clob_client_v2_1.OrderType.GTC : undefined) : clob_client_v2_1.OrderType.FOK;
    const orderTypeLabel = orderType === clob_client_v2_1.OrderType.GTC ? 'GTC' : 'FOK';
    if (adjustedTokens !== roundedTokens || roundedTokens !== tokensToOrder || limitPrice !== initialLimitPrice) {
        logger_1.default.info(`📐 Precision adjusted: ${(0, shared_1.formatTokenAmount)(tokensToOrder)} tokens @ $${initialLimitPrice.toFixed(6)} → ${(0, shared_1.formatTokenAmount)(adjustedTokens)} tokens @ $${limitPrice.toFixed(2)} (USDC: $${usdcAmount.toFixed(2)})`);
    }
    if (adjustedTokens <= 0) {
        logger_1.default.warning(`❌ Cannot place buy order: marketable buy precision requires token steps of ${(0, shared_1.formatTokenAmount)(stepTokens)} at price $${limitPrice.toFixed(2)}`);
        return {
            filledSize: 0,
            status: 'BELOW_MIN_NOTIONAL',
            success: false,
        };
    }
    if (!orderType) {
        logger_1.default.warning(`❌ Cannot place buy order: notional $${usdcAmount.toFixed(2)} is below $1 and token size ${(0, shared_1.formatTokenAmount)(adjustedTokens)} is not greater than 5`);
        return {
            filledSize: 0,
            status: 'BELOW_MIN_NOTIONAL',
            success: false,
        };
    }
    if (orderType === clob_client_v2_1.OrderType.GTC) {
        logger_1.default.info(`📋 Using GTC because buy notional is below $1 but token size is ${(0, shared_1.formatTokenAmount)(adjustedTokens)} (> 5)`);
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
            logger_1.default.success(`✅ ${orderTypeLabel} limit order placed: ${(0, shared_1.formatTokenAmount)(adjustedTokens)} tokens @ $${limitPrice.toFixed(4)}`);
            logger_1.default.info(`Order ID: ${response.orderID}`);
            return {
                filledSize: adjustedTokens,
                status: 'PLACED',
                orderID: response.orderID,
                orderType: orderTypeLabel,
                success: true,
            };
        }
        const errorMsg = (0, shared_1.extractOrderError)(response) || 'Unknown error';
        if ((0, shared_1.isPermanentOrderError)(errorMsg)) {
            if (errorMsg.toLowerCase().includes('deposit wallet flow')) {
                const missingConfig = [];
                if (!process.env.TRADING_WALLET)
                    missingConfig.push('TRADING_WALLET');
                if ((process.env.WALLET_MODE || '').toUpperCase() !== 'DEPOSIT') {
                    missingConfig.push("WALLET_MODE='DEPOSIT'");
                }
                if (!process.env.POLY_BUILDER_CODE)
                    missingConfig.push('POLY_BUILDER_CODE');
                if (!process.env.POLY_BUILDER_API_KEY)
                    missingConfig.push('POLY_BUILDER_API_KEY');
                if (!process.env.POLY_BUILDER_API_SECRET)
                    missingConfig.push('POLY_BUILDER_API_SECRET');
                if (!process.env.POLY_BUILDER_API_PASSPHRASE) {
                    missingConfig.push('POLY_BUILDER_API_PASSPHRASE');
                }
                logger_1.default.error(`🚫 Deposit wallet flow required. ${missingConfig.length > 0 ? `Missing config: ${missingConfig.join(', ')}` : 'Initialize deposit wallet mode and retry.'}`);
            }
            logger_1.default.error(`🚫 Permanent order error (no retry): ${errorMsg}`);
            return {
                filledSize: 0,
                status: 'PERMANENT_ERROR',
                orderType: orderTypeLabel,
                success: false,
            };
        }
        if ((0, shared_1.isInsufficientBalanceOrAllowanceError)(errorMsg)) {
            logger_1.default.warning(`⚠️ Insufficient balance/allowance: ${errorMsg}`);
            return {
                filledSize: 0,
                status: 'INSUFFICIENT_BALANCE',
                orderType: orderTypeLabel,
                success: false,
            };
        }
        logger_1.default.warning(`${orderTypeLabel} limit order failed: ${errorMsg}`);
        return { filledSize: 0, status: 'FAILED', orderType: orderTypeLabel, success: false };
    }
    catch (error) {
        const errorStr = String(error);
        if ((0, shared_1.isPermanentOrderError)(errorStr)) {
            logger_1.default.error(`🚫 Permanent order error (no retry): ${errorStr}`);
            return {
                filledSize: 0,
                status: 'PERMANENT_ERROR',
                orderType: orderTypeLabel,
                success: false,
            };
        }
        if ((0, shared_1.isInsufficientBalanceOrAllowanceError)(errorStr)) {
            logger_1.default.warning(`⚠️ Insufficient balance/allowance: ${errorStr}`);
            return {
                filledSize: 0,
                status: 'INSUFFICIENT_BALANCE',
                orderType: orderTypeLabel,
                success: false,
            };
        }
        logger_1.default.error(`Failed to place ${orderTypeLabel} limit order: ${error}`);
        return { filledSize: 0, status: 'FAILED', orderType: orderTypeLabel, success: false };
    }
};
exports.placeLimitOrder = placeLimitOrder;
const handleExecutionError = async (userAddress, trade, errorMsg, isSell = false) => {
    if (!(0, shared_1.isPermanentOrderError)(errorMsg)) {
        return false;
    }
    logger_1.default.error(`🚫 Permanent error - market closed or does not exist: ${errorMsg}`);
    logger_1.default.warning('Skipping order (no retry for closed markets)');
    const userActivity = (0, userHistory_1.getUserActivityModel)(userAddress);
    trade.bot = true;
    if (isSell) {
        trade.sellStatus = 'MARKET_CLOSED';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'MARKET_CLOSED' });
        return true;
    }
    trade.buyStatus = 'MARKET_CLOSED';
    await userActivity.updateOne({ _id: trade._id }, { bot: true, buyStatus: 'MARKET_CLOSED' });
    return true;
};
exports.handleExecutionError = handleExecutionError;
