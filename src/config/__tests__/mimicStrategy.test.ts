import type { MimicStrategyConfig } from '../mimicStrategy';
import {
    calculateOrderSize,
    validateMimicStrategyConfig,
} from '../mimicStrategy';

describe('calculateOrderSize', () => {
    const baseConfig: MimicStrategyConfig = {
        mimicSize: 10.0, // 10%
        maxOrderSizeUSD: 100.0,
    };

    describe('PERCENTAGE strategy', () => {
        it('should calculate correct percentage of trader order', () => {
            const result = calculateOrderSize(baseConfig, 100, 1000, 0);
            expect(result.finalAmount).toBe(10);
            expect(result.belowMinimum).toBe(false);
        });

        it('should cap at maxOrderSizeUSD', () => {
            const result = calculateOrderSize(baseConfig, 2000, 10000, 0);
            expect(result.finalAmount).toBe(100); // Capped at max
            expect(result.cappedByMax).toBe(true);
        });

        it('should return 0 if below minimum', () => {
            const result = calculateOrderSize(baseConfig, 5, 1000, 0);
            expect(result.finalAmount).toBe(0);
            expect(result.belowMinimum).toBe(true);
        });

        it('should reduce to fit available balance', () => {
            const result = calculateOrderSize(baseConfig, 100, 5, 0);
            expect(result.finalAmount).toBeLessThanOrEqual(5 * 0.99);
            expect(result.reducedByBalance).toBe(true);
        });
    });

    describe('Position limits', () => {
        it('should allow order within limit', () => {
            const configWithLimit: MimicStrategyConfig = {
                ...baseConfig,
                maxPositionSizeUSD: 50.0,
            };
            const result = calculateOrderSize(configWithLimit, 100, 1000, 40);
            expect(result.finalAmount).toBe(10); // 40 + 10 = 50, within limit
        });

        it('should reduce order if it would exceed maxPositionSizeUSD', () => {
            const configWithLimit: MimicStrategyConfig = {
                ...baseConfig,
                maxPositionSizeUSD: 50.0,
            };
            const result = calculateOrderSize(configWithLimit, 100, 1000, 45);
            expect(result.finalAmount).toBeLessThanOrEqual(5);
        });
    });
});

describe('validateMimicStrategyConfig', () => {
    it('should validate correct config', () => {
        const config: MimicStrategyConfig = {
            mimicSize: 10.0,
            maxOrderSizeUSD: 100.0,
        };
        const errors = validateMimicStrategyConfig(config);
        expect(errors).toHaveLength(0);
    });

    it('should detect invalid mimicSize', () => {
        const config: MimicStrategyConfig = {
            mimicSize: -5.0,
            maxOrderSizeUSD: 100.0,
        };
        const errors = validateMimicStrategyConfig(config);
        expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect mimicSize > 100 for PERCENTAGE', () => {
        const config: MimicStrategyConfig = {
            mimicSize: 150.0,
            maxOrderSizeUSD: 100.0,
        };
        const errors = validateMimicStrategyConfig(config);
        expect(errors.some((e) => e.includes('mimicSize'))).toBe(true);
    });

});
