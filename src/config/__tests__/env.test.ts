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

    it('parses JSON LEADER_ADDRESSES and exposes the legacy import alias', () => {
        process.env.LEADER_ADDRESSES =
            '["0x1234567890123456789012345678901234567890", "0x0987654321098765432109876543210987654321"]';

        const { ENV } = require('../env');
        expect(ENV.LEADER_ADDRESSES).toHaveLength(2);
        expect(ENV.USER_ADDRESSES).toBe(ENV.LEADER_ADDRESSES);
    });

    it('accepts USER_ADDRESSES as a deprecated compatibility input', () => {
        process.env.USER_ADDRESSES = '0x1234567890123456789012345678901234567890';

        const { ENV } = require('../env');
        expect(ENV.LEADER_ADDRESSES).toEqual([
            '0x1234567890123456789012345678901234567890',
        ]);
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
