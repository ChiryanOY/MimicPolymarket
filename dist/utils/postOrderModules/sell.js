"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeSellOrder = void 0;
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const mimicStrategy_1 = require("../../config/mimicStrategy");
const userHistory_1 = require("../../models/userHistory");
const myStateManager_1 = require("../../services/myStateManager");
const logger_1 = __importDefault(require("../logger"));
const balance_1 = require("./balance");
const orders_1 = require("./orders");
const shared_1 = require("./shared");
const executeSellOrder = async (clobClient, trade, _myPosition, userPosition, userAddress) => {
    const userActivity = (0, userHistory_1.getUserActivityModel)(userAddress);
    const traderStrategy = (0, mimicStrategy_1.getStrategyForTrader)(userAddress, shared_1.TRADER_STRATEGIES_MAP, shared_1.MIMIC_STRATEGY_CONFIG);
    logger_1.default.info('Executing SELL strategy...');
    let remaining = 0;
    logger_1.default.info('🔍 Checking for pending BUY orders before selling...');
    const cancelResult = await (0, orders_1.cancelBuyOrdersForAsset)(clobClient, trade.asset);
    if (cancelResult.cancelled > 0) {
        if (cancelResult.success) {
            logger_1.default.success(`✅ Cancelled ${cancelResult.cancelled} pending BUY order(s) before selling`);
        }
        else {
            logger_1.default.warning(`⚠️ Partially cancelled ${cancelResult.cancelled} BUY order(s), some orders may still be pending`);
            logger_1.default.warning('⚠️ Proceeding with sell operation anyway...');
        }
    }
    else {
        logger_1.default.info('✅ No pending BUY orders found');
    }
    logger_1.default.info(`🔍 Fetching real-time CLOB token balance for ${trade.asset}...`);
    try {
        await clobClient.updateBalanceAllowance({
            asset_type: clob_client_v2_1.AssetType.CONDITIONAL,
            token_id: trade.asset,
        });
        logger_1.default.info('✅ Polymarket token balance cache updated');
    }
    catch (cacheError) {
        logger_1.default.warning(`⚠️ Failed to update Polymarket balance cache: ${cacheError}`);
    }
    const realClobBalance = await (0, balance_1.getRealBalance)(clobClient, clob_client_v2_1.AssetType.CONDITIONAL, trade.asset);
    let clobTokenBalance = 0;
    if (realClobBalance !== null) {
        clobTokenBalance = realClobBalance;
        logger_1.default.info(`✅ Real CLOB balance retrieved: ${clobTokenBalance.toFixed(4)} tokens`);
    }
    else {
        const myPosState = myStateManager_1.myStateManager.getPosition(trade.asset);
        clobTokenBalance = myPosState ? parseFloat(String(myPosState.size || '0')) : 0;
        logger_1.default.warning(`⚠️ Failed to get real CLOB balance, falling back to local state: ${clobTokenBalance.toFixed(4)} tokens`);
    }
    if (clobTokenBalance <= 0.001) {
        logger_1.default.warning('No position to sell (verified in memory)');
        trade.bot = true;
        trade.sellStatus = 'NO_POSITION';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'NO_POSITION' });
        return;
    }
    const myPositionSize = clobTokenBalance;
    if (!userPosition || parseFloat(String(userPosition.size || '0')) <= 0.001) {
        remaining = myPositionSize;
        logger_1.default.info(`Trader closed entire position (or position not found) → Selling all your ${remaining.toFixed(2)} tokens`);
    }
    else {
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
        logger_1.default.info(`Position comparison: Trader API size ${userPosSize.toFixed(2)} tokens, You have ${myPositionSize.toFixed(2)} tokens`);
        logger_1.default.info(`Trader selling: ${trade.size.toFixed(2)} tokens (${(traderSellPercent * 100).toFixed(2)}% of their position)`);
        remaining = myPositionSize * traderSellPercent;
        logger_1.default.info(`Calculating sell: ${myPositionSize.toFixed(2)} × ${(traderSellPercent * 100).toFixed(2)}% = ${remaining.toFixed(2)} tokens`);
    }
    remaining = (0, shared_1.roundTokensTo2Decimals)(remaining);
    if (remaining > clobTokenBalance) {
        logger_1.default.warning(`⚠️ Calculated sell amount (${remaining.toFixed(2)}) > available balance (${clobTokenBalance.toFixed(4)}).`);
        logger_1.default.warning('📉 Adjusting sell amount down to actual available tokens.');
        remaining = clobTokenBalance;
    }
    remaining = (0, shared_1.roundTokensTo2Decimals)(remaining);
    if (remaining < 0.01) {
        logger_1.default.warning('🚫 Available balance is 0 (or too small). Skipping sell operation to avoid rejection.');
        trade.bot = true;
        trade.sellStatus = 'INSUFFICIENT_BALANCE';
        await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'INSUFFICIENT_BALANCE' });
        return;
    }
    let retry = 0;
    let totalSoldTokens = 0;
    while (remaining > 0 && retry < shared_1.RETRY_LIMIT) {
        if (retry > 0) {
            const retryRealBalance = await (0, balance_1.getRealBalance)(clobClient, clob_client_v2_1.AssetType.CONDITIONAL, trade.asset);
            if (retryRealBalance !== null) {
                clobTokenBalance = retryRealBalance;
                logger_1.default.info(`✅ Retry real CLOB balance retrieved: ${clobTokenBalance.toFixed(4)} tokens`);
            }
            else {
                const currentMyPos = myStateManager_1.myStateManager.getPosition(trade.asset);
                clobTokenBalance = currentMyPos ? parseFloat(String(currentMyPos.size || '0')) : 0;
            }
            if (remaining > clobTokenBalance) {
                logger_1.default.warning(`⚠️ Available balance dropped to ${clobTokenBalance.toFixed(4)} during retry. Adjusting sell amount.`);
                remaining = (0, shared_1.roundTokensTo2Decimals)(clobTokenBalance);
                if (remaining < 0.01) {
                    logger_1.default.warning('🚫 Available balance depleted during retry. Stopping.');
                    break;
                }
            }
        }
        const orderAmount = remaining;
        let orderBook;
        try {
            orderBook = await clobClient.getOrderBook(trade.asset);
        }
        catch (error) {
            const orderBookError = error;
            const errorData = orderBookError.response?.data;
            const errorStatus = orderBookError.response?.status;
            if (errorStatus === 404 ||
                (errorData?.error && errorData.error.includes('No orderbook exists'))) {
                logger_1.default.error(`🚫 Market closed or does not exist for token ${trade.asset}`);
                trade.bot = true;
                trade.sellStatus = 'MARKET_CLOSED';
                await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'MARKET_CLOSED' });
                return;
            }
            retry += 1;
            logger_1.default.warning(`Order book fetch error (attempt ${retry}/${shared_1.RETRY_LIMIT}): ${orderBookError.message || orderBookError}`);
            continue;
        }
        if (!orderBook.bids || orderBook.bids.length === 0) {
            logger_1.default.warning('No bids available in order book');
            trade.bot = true;
            trade.sellStatus = 'NO_BIDS';
            await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'NO_BIDS' });
            break;
        }
        const maxPriceBid = orderBook.bids.reduce((max, bid) => {
            return parseFloat(bid.price) > parseFloat(max.price) ? bid : max;
        }, orderBook.bids[0]);
        const rawBidPrice = parseFloat(maxPriceBid.price);
        const effectiveSellSlippageThreshold = traderStrategy.sellSlippageThreshold ?? shared_1.SELL_SLIPPAGE_THRESHOLD;
        const priceWithSlippage = Math.max(0.01, rawBidPrice - effectiveSellSlippageThreshold);
        const limitPrice = (0, shared_1.clampPrice)((0, shared_1.roundPriceTo2Decimals)(priceWithSlippage, true));
        logger_1.default.info(`Best bid: $${rawBidPrice.toFixed(4)} → slippage adjusted limit price: $${limitPrice.toFixed(2)}`);
        const sellAmount = (0, shared_1.roundTokensTo2Decimals)(orderAmount);
        const orderArgs = {
            side: clob_client_v2_1.Side.SELL,
            tokenID: trade.asset,
            amount: sellAmount,
            price: limitPrice,
        };
        try {
            const signedOrder = await clobClient.createMarketOrder(orderArgs);
            const response = await clobClient.postOrder(signedOrder, clob_client_v2_1.OrderType.FOK);
            if (response.success === true) {
                retry = 0;
                totalSoldTokens += orderArgs.amount;
                logger_1.default.orderResult(true, `Sold ${orderArgs.amount.toFixed(2)} tokens at $${orderArgs.price}`);
                remaining -= orderArgs.amount;
                continue;
            }
            const errorMessage = (0, shared_1.extractOrderError)(response);
            if ((0, shared_1.isPermanentOrderError)(errorMessage)) {
                logger_1.default.error(`🚫 Permanent error - market closed or does not exist: ${errorMessage}`);
                trade.bot = true;
                trade.sellStatus = 'MARKET_CLOSED';
                await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'MARKET_CLOSED' });
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }
            if ((0, shared_1.isFokFillError)(errorMessage)) {
                logger_1.default.warning(`🔄 FOK order not fully filled due to market changes: ${errorMessage}. Retrying...`);
                retry += 1;
                continue;
            }
            const isNetworkError = !errorMessage && (!response || response.status === undefined);
            if (!isNetworkError) {
                logger_1.default.error(`🚫 Order rejected by exchange: ${errorMessage || JSON.stringify(response)}`);
                trade.bot = true;
                trade.sellStatus = 'EXCHANGE_REJECTED';
                await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'EXCHANGE_REJECTED' });
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }
            retry += 1;
            logger_1.default.warning(`Order failed (network/unknown error, attempt ${retry}/${shared_1.RETRY_LIMIT})${errorMessage ? ` - ${errorMessage}` : ''}`);
        }
        catch (error) {
            const errorStr = String(error);
            const errorMessage = (0, shared_1.extractOrderError)(error);
            if ((0, shared_1.isPermanentOrderError)(errorStr) || (0, shared_1.isPermanentOrderError)(errorMessage)) {
                logger_1.default.error(`🚫 Permanent error - market closed or does not exist: ${errorStr}`);
                trade.bot = true;
                trade.sellStatus = 'MARKET_CLOSED';
                await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'MARKET_CLOSED' });
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }
            if ((0, shared_1.isFokFillError)(errorStr) || (0, shared_1.isFokFillError)(errorMessage)) {
                logger_1.default.warning(`🔄 FOK order not fully filled due to market changes: ${errorMessage || errorStr}. Retrying...`);
                retry += 1;
                continue;
            }
            const isNetworkError = errorStr.includes('timeout') ||
                errorStr.includes('ECONN') ||
                errorStr.includes('network') ||
                errorStr.includes('socket') ||
                errorStr.includes('EAI_AGAIN') ||
                (!!errorMessage &&
                    (errorMessage.includes('timeout') ||
                        errorMessage.includes('network') ||
                        errorMessage.includes('ECONN')));
            if (!isNetworkError && (errorMessage || errorStr.includes('status code'))) {
                logger_1.default.error(`🚫 Order rejected by exchange: ${errorMessage || errorStr}`);
                trade.bot = true;
                trade.sellStatus = 'EXCHANGE_REJECTED';
                await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: 'EXCHANGE_REJECTED' });
                if (totalSoldTokens > 0) {
                    break;
                }
                return;
            }
            retry += 1;
            logger_1.default.error(`Order network error (attempt ${retry}/${shared_1.RETRY_LIMIT}): ${error}`);
        }
    }
    if (retry >= shared_1.RETRY_LIMIT) {
        trade.bot = true;
        trade.sellStatus = 'RETRY_LIMIT_REACHED';
        await userActivity.updateOne({ _id: trade._id }, {
            bot: true,
            botExcutedTime: retry,
            sellStatus: 'RETRY_LIMIT_REACHED',
        });
        return;
    }
    trade.bot = true;
    if (totalSoldTokens > 0) {
        trade.sellStatus = 'SUCCESS';
        logger_1.default.success(`✅ Sell completed: ${totalSoldTokens.toFixed(2)} tokens sold`);
    }
    await userActivity.updateOne({ _id: trade._id }, { bot: true, sellStatus: trade.sellStatus });
};
exports.executeSellOrder = executeSellOrder;
