"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRealBalance = void 0;
const logger_1 = __importDefault(require("../logger"));
const getRealBalance = async (clobClient, assetType, tokenId) => {
    try {
        const params = { asset_type: assetType };
        if (tokenId) {
            params.token_id = tokenId;
        }
        const response = (await clobClient.getBalanceAllowance(params));
        if (response && response.balance !== undefined) {
            const rawBalance = parseFloat(String(response.balance));
            if (!isNaN(rawBalance)) {
                return rawBalance / 1000000;
            }
        }
        return null;
    }
    catch (error) {
        logger_1.default.warning(`⚠️ Failed to fetch real CLOB balance for ${assetType}: ${error}`);
        return null;
    }
};
exports.getRealBalance = getRealBalance;
