"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRealBalance = void 0;
const logger_1 = __importDefault(require("./logger"));
const balance_1 = require("./postOrderModules/balance");
const buy_1 = require("./postOrderModules/buy");
const sell_1 = require("./postOrderModules/sell");
const getRealBalance = async (clobClient, assetType, tokenId) => {
    return (0, balance_1.getRealBalance)(clobClient, assetType, tokenId);
};
exports.getRealBalance = getRealBalance;
const postOrder = async (clobClient, condition, myPosition, userPosition, trade, myBalance, _userBalance, userAddress, myPositions, _userPositions) => {
    if (condition === 'buy') {
        await (0, buy_1.executeBuyOrder)(clobClient, trade, myBalance, userAddress, myPositions);
        return;
    }
    if (condition === 'sell') {
        await (0, sell_1.executeSellOrder)(clobClient, trade, myPosition, userPosition, userAddress);
        return;
    }
    logger_1.default.error(`Unknown condition: ${condition}`);
};
exports.default = postOrder;
