"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySyntheticTradeStatus = exports.resetTradeForRetry = exports.markTradeStatus = exports.markTradesAsProcessing = exports.markTradeAsProcessing = exports.readPendingTrades = exports.createUserActivityModels = void 0;
const userHistory_1 = require("../../models/userHistory");
const createUserActivityModels = (addresses) => {
    return addresses.map((address) => ({
        address,
        model: (0, userHistory_1.getUserActivityModel)(address),
    }));
};
exports.createUserActivityModels = createUserActivityModels;
const readPendingTrades = async (userActivityModels) => {
    const allTrades = [];
    for (const { address, model } of userActivityModels) {
        const trades = await model
            .find({
            $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: 0 }],
        })
            .sort({ timestamp: 1 })
            .exec();
        const tradesWithUser = trades.map((trade) => ({
            ...trade.toObject(),
            userAddress: address,
        }));
        allTrades.push(...tradesWithUser);
    }
    allTrades.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return allTrades;
};
exports.readPendingTrades = readPendingTrades;
const markTradeAsProcessing = async (trade) => {
    const userActivity = (0, userHistory_1.getUserActivityModel)(trade.userAddress);
    await userActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });
};
exports.markTradeAsProcessing = markTradeAsProcessing;
const markTradesAsProcessing = async (trades) => {
    for (const trade of trades) {
        await (0, exports.markTradeAsProcessing)(trade);
    }
};
exports.markTradesAsProcessing = markTradesAsProcessing;
const markTradeStatus = async (userAddress, tradeId, status) => {
    const userActivity = (0, userHistory_1.getUserActivityModel)(userAddress);
    await userActivity.updateOne({ _id: tradeId }, status);
};
exports.markTradeStatus = markTradeStatus;
const resetTradeForRetry = async (trade) => {
    const userActivity = (0, userHistory_1.getUserActivityModel)(trade.userAddress);
    await userActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 0 } });
};
exports.resetTradeForRetry = resetTradeForRetry;
const applySyntheticTradeStatus = async (trades, syntheticTrade) => {
    for (const trade of trades) {
        const userActivity = (0, userHistory_1.getUserActivityModel)(trade.userAddress);
        await userActivity.updateOne({ _id: trade._id }, {
            $set: {
                bot: syntheticTrade.bot,
                buyStatus: syntheticTrade.buyStatus,
                sellStatus: syntheticTrade.sellStatus,
            },
        });
    }
};
exports.applySyntheticTradeStatus = applySyntheticTradeStatus;
