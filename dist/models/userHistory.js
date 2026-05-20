"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserPositionModel = exports.getUserActivityModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const positionSchema = new mongoose_1.Schema({
    _id: {
        type: mongoose_1.Schema.Types.ObjectId,
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
const activitySchema = new mongoose_1.Schema({
    _id: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        auto: true,
    },
    proxyWallet: { type: String, required: false },
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
});
const getUserPositionModel = (walletAddress) => {
    const collectionName = `user_positions_${walletAddress}`;
    return mongoose_1.default.model(collectionName, positionSchema, collectionName);
};
exports.getUserPositionModel = getUserPositionModel;
const getUserActivityModel = (walletAddress) => {
    const collectionName = `user_activities_${walletAddress}`;
    return mongoose_1.default.model(collectionName, activitySchema, collectionName);
};
exports.getUserActivityModel = getUserActivityModel;
