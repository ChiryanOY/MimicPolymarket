"use strict";
/**
 * Mimic Trading Strategy Configuration
 *
 * This module defines a fixed percentage-based strategy for mimicking
 * trades from followed traders.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOrderSize = calculateOrderSize;
exports.validateMimicStrategyConfig = validateMimicStrategyConfig;
exports.getRecommendedConfig = getRecommendedConfig;
exports.parseTraderStrategies = parseTraderStrategies;
exports.getStrategyForTrader = getStrategyForTrader;
/**
 * Calculate order size based on mimic strategy
 */
function calculateOrderSize(config, traderOrderSize, availableBalance, currentPositionSize = 0) {
    const baseAmount = traderOrderSize * (config.mimicSize / 100);
    let reasoning = `${config.mimicSize}% of trader's $${traderOrderSize.toFixed(2)} = $${baseAmount.toFixed(2)}`;
    let finalAmount = baseAmount;
    let cappedByMax = false;
    let reducedByBalance = false;
    let belowMinimum = false;
    // Step 2: Apply maximum order size limit
    if (finalAmount > config.maxOrderSizeUSD) {
        finalAmount = config.maxOrderSizeUSD;
        cappedByMax = true;
        reasoning += ` → Capped at max $${config.maxOrderSizeUSD}`;
    }
    // Step 3: Apply maximum position size limit (if configured)
    if (config.maxPositionSizeUSD) {
        const newTotalPosition = currentPositionSize + finalAmount;
        if (newTotalPosition > config.maxPositionSizeUSD) {
            const allowedAmount = Math.max(0, config.maxPositionSizeUSD - currentPositionSize);
            if (allowedAmount < 5) {
                finalAmount = 0;
                reasoning += ` → Position limit reached`;
            }
            else {
                finalAmount = allowedAmount;
                reasoning += ` → Reduced to fit position limit`;
            }
        }
    }
    // Step 4: Check available balance (with 1% safety buffer)
    const maxAffordable = availableBalance * 0.99;
    if (finalAmount > maxAffordable) {
        finalAmount = maxAffordable;
        reducedByBalance = true;
        reasoning += ` → Reduced to fit balance ($${maxAffordable.toFixed(2)})`;
    }
    // Step 5: Check minimum order size
    if (finalAmount < 5) {
        belowMinimum = true;
        reasoning += ` → Below Polymarket minimum 5 tokens`;
        finalAmount = 0; // Don't execute
    }
    return {
        traderOrderSize,
        baseAmount,
        finalAmount,
        cappedByMax,
        reducedByBalance,
        belowMinimum,
        reasoning,
    };
}
/**
 * Validate mimic strategy configuration
 */
function validateMimicStrategyConfig(config) {
    const errors = [];
    // Validate mimicSize
    if (config.mimicSize <= 0) {
        errors.push('mimicSize must be positive');
    }
    if (config.mimicSize > 100) {
        errors.push('mimicSize for PERCENTAGE strategy should be <= 100');
    }
    // Validate limits
    if (config.maxOrderSizeUSD <= 0) {
        errors.push('maxOrderSizeUSD must be positive');
    }
    return errors;
}
/**
 * Get recommended configuration for different balance sizes
 */
function getRecommendedConfig(balanceUSD) {
    if (balanceUSD < 500) {
        // Small balance: Conservative
        return {
            mimicSize: 5.0,
            maxOrderSizeUSD: 20.0,
            maxPositionSizeUSD: 50.0,
            maxDailyVolumeUSD: 100.0,
        };
    }
    else if (balanceUSD < 2000) {
        // Medium balance: Balanced
        return {
            mimicSize: 10.0,
            maxOrderSizeUSD: 50.0,
            maxPositionSizeUSD: 200.0,
            maxDailyVolumeUSD: 500.0,
        };
    }
    else {
        // Large balance: Aggressive PERCENTAGE
        return {
            mimicSize: 10.0,
            maxOrderSizeUSD: 100.0,
            maxPositionSizeUSD: 1000.0,
            maxDailyVolumeUSD: 2000.0,
        };
    }
}
/**
 * Parse trader-specific strategies from JSON string
 *
 * Format:
 * [
 *   { "address": "0xaaa...", "mimicSize": 10, "maxOrderSizeUSD": 100 },
 *   { "address": "0xbbb...", "mimicSize": 25 }
 * ]
 *
 * @param jsonStr - JSON string containing array of trader strategies
 * @param defaultConfig - Default config to use for missing values
 * @returns Map of trader address (lowercase) to MimicStrategyConfig
 */
function parseTraderStrategies(jsonStr, defaultConfig) {
    const strategiesMap = new Map();
    if (!jsonStr || jsonStr.trim() === '') {
        return strategiesMap;
    }
    try {
        const traders = JSON.parse(jsonStr);
        if (!Array.isArray(traders)) {
            throw new Error('TRADER_STRATEGIES must be a JSON array');
        }
        for (const trader of traders) {
            if (!trader.address) {
                throw new Error('Each trader strategy must have an "address" field');
            }
            if (trader.mimicSize === undefined || trader.mimicSize === null) {
                throw new Error(`Trader ${trader.address} must have a "mimicSize" field`);
            }
            const address = trader.address.toLowerCase().trim();
            // Validate address format
            if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
                throw new Error(`Invalid address format: ${trader.address}`);
            }
            const config = {
                mimicSize: trader.mimicSize,
                maxOrderSizeUSD: trader.maxOrderSizeUSD ?? defaultConfig.maxOrderSizeUSD,
                maxPositionSizeUSD: trader.maxPositionSizeUSD ?? defaultConfig.maxPositionSizeUSD,
            };
            // Apply per-trader buy slippage threshold if provided
            if (trader.buySlippageThreshold !== undefined) {
                config.buySlippageThreshold = trader.buySlippageThreshold;
            }
            // Apply per-trader sell slippage threshold if provided
            if (trader.sellSlippageThreshold !== undefined) {
                config.sellSlippageThreshold = trader.sellSlippageThreshold;
            }
            // Apply per-trader trade aggregation settings if provided
            if (trader.tradeAggregationEnabled !== undefined) {
                config.tradeAggregationEnabled = trader.tradeAggregationEnabled;
            }
            if (trader.tradeAggregationWindowSeconds !== undefined) {
                // Validate minimum 0.1 second
                if (trader.tradeAggregationWindowSeconds < 0.1) {
                    throw new Error(`Trader ${trader.address}: tradeAggregationWindowSeconds must be at least 0.1 second`);
                }
                config.tradeAggregationWindowSeconds = trader.tradeAggregationWindowSeconds;
            }
            strategiesMap.set(address, config);
        }
        return strategiesMap;
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid JSON format for TRADER_STRATEGIES: ${error.message}`);
        }
        throw error;
    }
}
/**
 * Get the mimic strategy for a specific trader
 *
 * @param traderAddress - The trader's address
 * @param traderStrategies - Map of trader-specific strategies
 * @param defaultConfig - Default config to use if no specific strategy exists
 * @returns MimicStrategyConfig for the trader
 */
function getStrategyForTrader(traderAddress, traderStrategies, defaultConfig) {
    const normalizedAddress = traderAddress.toLowerCase().trim();
    return traderStrategies.get(normalizedAddress) || defaultConfig;
}
