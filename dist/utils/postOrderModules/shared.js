"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFokFillError = exports.isPermanentOrderError = exports.isInsufficientBalanceOrAllowanceError = exports.extractOrderError = exports.formatTokenAmount = exports.alignMarketBuyOrder = exports.clampPrice = exports.roundPriceTo2Decimals = exports.roundTokensTo4Decimals = exports.roundTokensTo2Decimals = exports.SELL_SLIPPAGE_THRESHOLD = exports.BUY_SLIPPAGE_THRESHOLD = exports.TRADER_STRATEGIES_MAP = exports.MIMIC_STRATEGY_CONFIG = exports.RETRY_LIMIT = void 0;
const env_1 = require("../../config/env");
exports.RETRY_LIMIT = env_1.ENV.RETRY_LIMIT;
exports.MIMIC_STRATEGY_CONFIG = env_1.ENV.MIMIC_STRATEGY_CONFIG;
exports.TRADER_STRATEGIES_MAP = env_1.ENV.TRADER_STRATEGIES_MAP;
exports.BUY_SLIPPAGE_THRESHOLD = env_1.ENV.BUY_SLIPPAGE_THRESHOLD;
exports.SELL_SLIPPAGE_THRESHOLD = env_1.ENV.SELL_SLIPPAGE_THRESHOLD;
const roundTokensTo2Decimals = (tokens) => {
    return Math.floor(tokens * 100 + 1e-9) / 100;
};
exports.roundTokensTo2Decimals = roundTokensTo2Decimals;
const roundTokensTo4Decimals = (tokens) => {
    return Math.floor(tokens * 10000 + 1e-9) / 10000;
};
exports.roundTokensTo4Decimals = roundTokensTo4Decimals;
const roundPriceTo2Decimals = (price, roundDown = true) => {
    if (roundDown) {
        return Math.floor(price * 100 + 1e-9) / 100;
    }
    return Math.ceil(price * 100 - 1e-9) / 100;
};
exports.roundPriceTo2Decimals = roundPriceTo2Decimals;
const clampPrice = (price) => {
    return Math.max(0.01, Math.min(0.99, price));
};
exports.clampPrice = clampPrice;
const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const remainder = x % y;
        x = y;
        y = remainder;
    }
    return x || 1;
};
const alignMarketBuyOrder = (tokens, price) => {
    const roundedPrice = (0, exports.roundPriceTo2Decimals)(price, false);
    const priceCents = Math.round(roundedPrice * 100);
    if (priceCents <= 0) {
        return { adjustedTokens: 0, usdcAmount: 0, stepTokens: 0 };
    }
    const tokenUnits = Math.floor(tokens * 10000 + 1e-9);
    const stepUnits = 10000 / gcd(priceCents, 10000);
    const adjustedUnits = Math.floor(tokenUnits / stepUnits) * stepUnits;
    const adjustedTokens = adjustedUnits / 10000;
    const makerAmountCents = (adjustedUnits * priceCents) / 10000;
    return {
        adjustedTokens,
        usdcAmount: makerAmountCents / 100,
        stepTokens: stepUnits / 10000,
    };
};
exports.alignMarketBuyOrder = alignMarketBuyOrder;
const formatTokenAmount = (tokens) => {
    return tokens.toFixed(4).replace(/\.?0+$/, '');
};
exports.formatTokenAmount = formatTokenAmount;
const extractOrderError = (response) => {
    if (!response) {
        return undefined;
    }
    if (typeof response === 'string') {
        return response;
    }
    if (typeof response === 'object') {
        const data = response;
        const directError = data.error;
        if (typeof directError === 'string') {
            return directError;
        }
        if (typeof directError === 'object' && directError !== null) {
            const nested = directError;
            if (typeof nested.error === 'string') {
                return nested.error;
            }
            if (typeof nested.message === 'string') {
                return nested.message;
            }
        }
        if (typeof data.errorMsg === 'string') {
            return data.errorMsg;
        }
        if (typeof data.message === 'string') {
            return data.message;
        }
    }
    return undefined;
};
exports.extractOrderError = extractOrderError;
const isInsufficientBalanceOrAllowanceError = (message) => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};
exports.isInsufficientBalanceOrAllowanceError = isInsufficientBalanceOrAllowanceError;
const isPermanentOrderError = (message) => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return ((lower.includes('orderbook') && lower.includes('does not exist')) ||
        (lower.includes('orderbook') && lower.includes('not exist')) ||
        lower.includes('market is closed') ||
        lower.includes('market closed') ||
        lower.includes('token does not exist') ||
        lower.includes('invalid token') ||
        lower.includes('invalid token id') ||
        lower.includes('deposit wallet flow') ||
        lower.includes('maker address not allowed') ||
        (lower.includes('invalid amount') && lower.includes('min size')) ||
        (lower.includes('min size') && (lower.includes('$1') || lower.includes('$ 1'))) ||
        lower.includes('invalid amount for a marketable buy order') ||
        lower.includes('lower than the minimum') ||
        (lower.includes('size') && lower.includes('minimum') && !lower.includes('minimum: 5')));
};
exports.isPermanentOrderError = isPermanentOrderError;
const isFokFillError = (message) => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return (lower.includes('fully filled') ||
        lower.includes('fully fill') ||
        lower.includes('insufficient liquidity') ||
        lower.includes('cross maker') ||
        lower.includes('price') ||
        lower.includes('match') ||
        lower.includes('fok') ||
        lower.includes('fill or kill') ||
        lower.includes('slippage'));
};
exports.isFokFillError = isFokFillError;
