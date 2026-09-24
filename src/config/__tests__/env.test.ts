/* eslint-disable @typescript-eslint/no-require-imports */

describe('Environment variable parsing', () => {
    const originalEnv = process.env;
    const requiredEnv = {
        TRADING_WALLET: '0x1111111111111111111111111111111111111111',
        WALLET_MODE: 'LEGACY',
        PRIVATE_KEY: 'testkey',
        CLOB_HTTP_URL: 'https://clob.polymarket.com/',
        CLOB_WS_URL: 'wss://ws.polymarket.com/ws',
        MONGO_URI: 'mongodb://localhost:27017/test',
        RPC_URL: 'https://polygon-rpc.com',
        USDC_CONTRACT_ADDRESS: '0x2222222222222222222222222222222222222222',
    };

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv, ...requiredEnv };
        delete process.env.LEADER_ADDRESSES;
        delete process.env.USER_ADDRESSES;
        delete process.env.TRADER_STRATEGIES;
        delete process.env.CHAIN_CONFIRMATIONS;
        delete process.env.ONCHAIN_BACKFILL_INTERVAL_MS;
        delete process.env.ONCHAIN_BACKFILL_CHUNK_BLOCKS;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('parses comma-separated LEADER_ADDRESSES', () => {
        process.env.LEADER_ADDRESSES =
            '0x1234567890123456789012345678901234567890, 0x0987654321098765432109876543210987654321';

        const { ENV } = require('../env');
        expect(ENV.LEADER_ADDRESSES).toEqual([
            '0x1234567890123456789012345678901234567890',
            '0x0987654321098765432109876543210987654321',
        ]);
    });

    it('parses JSON LEADER_ADDRESSES', () => {
        process.env.LEADER_ADDRESSES =
            '["0x1234567890123456789012345678901234567890", "0x0987654321098765432109876543210987654321"]';

        const { ENV } = require('../env');
        expect(ENV.LEADER_ADDRESSES).toHaveLength(2);
    });

    it('rejects USER_ADDRESSES as a replacement for LEADER_ADDRESSES', () => {
        process.env.USER_ADDRESSES = '0x1234567890123456789012345678901234567890';

        expect(() => require('../env')).toThrow(
            'Missing required environment variables: LEADER_ADDRESSES'
        );
    });

    it('loads TRADER_STRATEGIES for on-chain leaders', () => {
        const leader = '0x1234567890123456789012345678901234567890';
        process.env.LEADER_ADDRESSES = leader;
        process.env.TRADER_STRATEGIES = JSON.stringify([
            {
                address: leader,
                mimicSize: 2.5,
                maxOrderSizeUSD: 75,
                maxPositionSizeUSD: 250,
                buySlippageThreshold: 0.02,
                sellSlippageThreshold: 0.01,
                tradeAggregationEnabled: true,
                tradeAggregationWindowSeconds: 3,
            },
        ]);

        const { ENV } = require('../env');
        expect(ENV.TRADER_STRATEGIES_MAP.get(leader)).toEqual({
            mimicSize: 2.5,
            maxOrderSizeUSD: 75,
            maxPositionSizeUSD: 250,
            buySlippageThreshold: 0.02,
            sellSlippageThreshold: 0.01,
            tradeAggregationEnabled: true,
            tradeAggregationWindowSeconds: 3,
        });
    });

    it('rejects an invalid leader address', () => {
        process.env.LEADER_ADDRESSES = 'invalid-address';
        expect(() => require('../env')).toThrow('Invalid Ethereum address');
    });

    it('rejects an unsafe backfill interval', () => {
        process.env.LEADER_ADDRESSES = '0x1234567890123456789012345678901234567890';
        process.env.ONCHAIN_BACKFILL_INTERVAL_MS = '100';
        expect(() => require('../env')).toThrow('Invalid ONCHAIN_BACKFILL_INTERVAL_MS');
    });
});
