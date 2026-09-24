import { ethers } from 'ethers';

jest.mock('../../config/env', () => ({
    ENV: {
        LEADER_ADDRESSES: [],
        CHAIN_CONFIRMATIONS: 2,
        ONCHAIN_BACKFILL_CHUNK_BLOCKS: 500,
        ONCHAIN_BACKFILL_INTERVAL_MS: 15_000,
        ONCHAIN_RECONNECT_DELAY_MS: 5_000,
        REQUEST_TIMEOUT_MS: 10_000,
        RPC_URL: 'https://polygon.invalid',
        POLYGON_WSS_URL: 'wss://polygon.invalid',
    },
}));
jest.mock('../../models/userHistory', () => ({}));
jest.mock('../../utils/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warning: jest.fn(), error: jest.fn(), success: jest.fn() },
}));
jest.mock('../marketMetadata', () => ({ ensureMarketMetadata: jest.fn() }));

import { getOrderFilledFilters } from '../onChainListener';

describe('on-chain leader filters', () => {
    it('filters indexed maker topics across every supported exchange', () => {
        const leader = '0x1234567890123456789012345678901234567890';
        const filters = getOrderFilledFilters([leader]);

        expect(filters).toHaveLength(5);
        for (const filter of filters) {
            expect(filter.topics?.[2]).toEqual([ethers.utils.hexZeroPad(leader, 32)]);
        }
    });

    it('chunks large leader lists to bounded topic filters', () => {
        const leaders = Array.from(
            { length: 51 },
            (_, index) => `0x${index.toString(16).padStart(40, '0')}`
        );
        expect(getOrderFilledFilters(leaders)).toHaveLength(10);
    });
});
