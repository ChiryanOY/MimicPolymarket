import { MimicStrategyConfig } from '../../config/mimicStrategy';
import { ENV } from '../../config/env';

export const RETRY_LIMIT = ENV.RETRY_LIMIT;
export const MIMIC_STRATEGY_CONFIG = ENV.MIMIC_STRATEGY_CONFIG;
export const TRADER_STRATEGIES_MAP = ENV.TRADER_STRATEGIES_MAP as Map<string, MimicStrategyConfig>;
export const BUY_SLIPPAGE_THRESHOLD = ENV.BUY_SLIPPAGE_THRESHOLD;
export const SELL_SLIPPAGE_THRESHOLD = ENV.SELL_SLIPPAGE_THRESHOLD;

export const roundTokensTo2Decimals = (tokens: number): number => {
    return Math.floor(tokens * 100 + 1e-9) / 100;
};

export const roundTokensTo4Decimals = (tokens: number): number => {
    return Math.floor(tokens * 10000 + 1e-9) / 10000;
};

export const roundPriceTo2Decimals = (price: number, roundDown: boolean = true): number => {
    if (roundDown) {
        return Math.floor(price * 100 + 1e-9) / 100;
    }
    return Math.ceil(price * 100 - 1e-9) / 100;
};

export const clampPrice = (price: number): number => {
    return Math.max(0.01, Math.min(0.99, price));
};

const gcd = (a: number, b: number): number => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const remainder = x % y;
        x = y;
        y = remainder;
    }
    return x || 1;
};

export const alignMarketBuyOrder = (
    tokens: number,
    price: number
): { adjustedTokens: number; usdcAmount: number; stepTokens: number } => {
    const roundedPrice = roundPriceTo2Decimals(price, false);
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

export const formatTokenAmount = (tokens: number): string => {
    return tokens.toFixed(4).replace(/\.?0+$/, '');
};

export const extractOrderError = (response: unknown): string | undefined => {
    if (!response) {
        return undefined;
    }

    if (typeof response === 'string') {
        return response;
    }

    if (typeof response === 'object') {
        const data = response as Record<string, unknown>;
        const directError = data.error;

        if (typeof directError === 'string') {
            return directError;
        }

        if (typeof directError === 'object' && directError !== null) {
            const nested = directError as Record<string, unknown>;
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

export const isInsufficientBalanceOrAllowanceError = (message: string | undefined): boolean => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return lower.includes('not enough balance') || lower.includes('allowance');
};

export const isPermanentOrderError = (message: string | undefined): boolean => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return (
        (lower.includes('orderbook') && lower.includes('does not exist')) ||
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
        (lower.includes('size') && lower.includes('minimum') && !lower.includes('minimum: 5'))
    );
};

export const isFokFillError = (message: string | undefined): boolean => {
    if (!message) {
        return false;
    }
    const lower = message.toLowerCase();
    return (
        lower.includes('fully filled') ||
        lower.includes('fully fill') ||
        lower.includes('insufficient liquidity') ||
        lower.includes('cross maker') ||
        lower.includes('price') ||
        lower.includes('match') ||
        lower.includes('fok') ||
        lower.includes('fill or kill') ||
        lower.includes('slippage')
    );
};
