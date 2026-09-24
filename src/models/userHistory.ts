import mongoose, { Schema } from 'mongoose';

const positionSchema = new Schema({
    _id: {
        type: Schema.Types.ObjectId,
        required: true,
        auto: true,
    },
    proxyWallet: { type: String, required: false },
    asset: { type: String, required: false },
    conditionId: { type: String, required: false },
    size: { type: Number, required: false },
    avgPrice: { type: Number, required: false },
    initialValue: { type: Number, required: false },
    currentValue: { type: Number, required: false },
    cashPnl: { type: Number, required: false },
    percentPnl: { type: Number, required: false },
    totalBought: { type: Number, required: false },
    realizedPnl: { type: Number, required: false },
    percentRealizedPnl: { type: Number, required: false },
    curPrice: { type: Number, required: false },
    redeemable: { type: Boolean, required: false },
    mergeable: { type: Boolean, required: false },
    title: { type: String, required: false },
    slug: { type: String, required: false },
    icon: { type: String, required: false },
    eventSlug: { type: String, required: false },
    outcome: { type: String, required: false },
    outcomeIndex: { type: Number, required: false },
    oppositeOutcome: { type: String, required: false },
    oppositeAsset: { type: String, required: false },
    endDate: { type: String, required: false },
    negativeRisk: { type: Boolean, required: false },
});

const activitySchema = new Schema({
    _id: {
        type: Schema.Types.ObjectId,
        required: true,
        auto: true,
    },
    proxyWallet: { type: String, required: false },
    eventId: { type: String, required: false, index: true, unique: true, sparse: true },
    timestamp: { type: Number, required: false },
    conditionId: { type: String, required: false },
    type: { type: String, required: false },
    size: { type: Number, required: false },
    usdcSize: { type: Number, required: false },
    transactionHash: { type: String, required: false },
    price: { type: Number, required: false },
    asset: { type: String, required: false },
    side: { type: String, required: false },
    outcomeIndex: { type: Number, required: false },
    title: { type: String, required: false },
    slug: { type: String, required: false },
    icon: { type: String, required: false },
    eventSlug: { type: String, required: false },
    outcome: { type: String, required: false },
    name: { type: String, required: false },
    pseudonym: { type: String, required: false },
    bio: { type: String, required: false },
    profileImage: { type: String, required: false },
    profileImageOptimized: { type: String, required: false },
    bot: { type: Boolean, required: false },
    botExcutedTime: { type: Number, required: false },
    exchangeVersion: { type: String, required: false },
    exchangeType: { type: String, required: false },
    blockNumber: { type: Number, required: false },
    logIndex: { type: Number, required: false },
});

const onChainCursorSchema = new Schema(
    {
        _id: { type: String, required: true },
        blockNumber: { type: Number, required: true },
    },
    { timestamps: true }
);

const getUserPositionModel = (walletAddress: string) => {
    const collectionName = `user_positions_${walletAddress}`;
    return mongoose.model(collectionName, positionSchema, collectionName);
};

const getUserActivityModel = (walletAddress: string) => {
    const collectionName = `user_activities_${walletAddress}`;
    return mongoose.model(collectionName, activitySchema, collectionName);
};

const getOnChainCursorModel = () =>
    mongoose.models.onchain_signal_cursors ||
    mongoose.model('onchain_signal_cursors', onChainCursorSchema, 'onchain_signal_cursors');

export { getOnChainCursorModel, getUserActivityModel, getUserPositionModel };
