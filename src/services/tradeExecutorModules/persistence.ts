import { getUserActivityModel } from '../../models/userHistory';
import { UserActivityInterface } from '../../interfaces/User';
import { TradeWithUser } from './types';

export interface UserActivityModelRef {
    address: string;
    model: ReturnType<typeof getUserActivityModel>;
}

export const createUserActivityModels = (addresses: string[]): UserActivityModelRef[] => {
    return addresses.map((address) => ({
        address,
        model: getUserActivityModel(address),
    }));
};

export const readPendingTrades = async (
    userActivityModels: UserActivityModelRef[]
): Promise<TradeWithUser[]> => {
    const allTrades: TradeWithUser[] = [];

    for (const { address, model } of userActivityModels) {
        const trades = await model
            .find({
                $and: [{ type: 'TRADE' }, { bot: false }, { botExcutedTime: 0 }],
            })
            .sort({ timestamp: 1 })
            .exec();

        const tradesWithUser = trades.map((trade) => ({
            ...(trade.toObject() as UserActivityInterface),
            userAddress: address,
        }));

        allTrades.push(...tradesWithUser);
    }

    allTrades.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return allTrades;
};

export const markTradeAsProcessing = async (trade: TradeWithUser): Promise<void> => {
    const userActivity = getUserActivityModel(trade.userAddress);
    await userActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 1 } });
};

export const markTradesAsProcessing = async (trades: TradeWithUser[]): Promise<void> => {
    for (const trade of trades) {
        await markTradeAsProcessing(trade);
    }
};

export const markTradeStatus = async (
    userAddress: string,
    tradeId: UserActivityInterface['_id'],
    status: Record<string, unknown>
): Promise<void> => {
    const userActivity = getUserActivityModel(userAddress);
    await userActivity.updateOne({ _id: tradeId }, status);
};

export const resetTradeForRetry = async (trade: TradeWithUser): Promise<void> => {
    const userActivity = getUserActivityModel(trade.userAddress);
    await userActivity.updateOne({ _id: trade._id }, { $set: { botExcutedTime: 0 } });
};

export const applySyntheticTradeStatus = async (
    trades: TradeWithUser[],
    syntheticTrade: UserActivityInterface
): Promise<void> => {
    for (const trade of trades) {
        const userActivity = getUserActivityModel(trade.userAddress);
        await userActivity.updateOne(
            { _id: trade._id },
            {
                $set: {
                    bot: syntheticTrade.bot,
                    buyStatus: syntheticTrade.buyStatus,
                    sellStatus: syntheticTrade.sellStatus,
                },
            }
        );
    }
};
