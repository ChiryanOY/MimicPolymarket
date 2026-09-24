import { ethers } from 'ethers';
import {
    ORDER_FILLED_TOPIC,
    ORDER_FILLED_V1_TOPIC,
    POLYMARKET_V1_EXCHANGE_ADDRESSES,
    POLYMARKET_V2_EXCHANGE_ADDRESSES,
    parseOrderFilledLog,
} from '../onChainOrderFilled';

const MAKER = '0x1234567890123456789012345678901234567890';
const TAKER = '0x1111111111111111111111111111111111111111';
const topicAddress = (address: string): string => ethers.utils.hexZeroPad(address, 32);
const orderHash = ethers.utils.hexZeroPad('0x42', 32);

const log = (overrides: Partial<ethers.providers.Log>): ethers.providers.Log =>
    ({
        address: POLYMARKET_V2_EXCHANGE_ADDRESSES[0],
        blockHash: ethers.constants.HashZero,
        blockNumber: 100,
        data: '0x',
        logIndex: 7,
        removed: false,
        topics: [],
        transactionHash: ethers.utils.hexZeroPad('0x99', 32),
        transactionIndex: 0,
        ...overrides,
    }) as ethers.providers.Log;

describe('parseOrderFilledLog', () => {
    it('decodes a V2 leader buy', () => {
        const parsed = parseOrderFilledLog(
            log({
                topics: [ORDER_FILLED_TOPIC, orderHash, topicAddress(MAKER), topicAddress(TAKER)],
                data: ethers.utils.defaultAbiCoder.encode(
                    ['uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32', 'bytes32'],
                    [0, 123, 20_000_000, 40_000_000, 0, ethers.constants.HashZero, ethers.constants.HashZero]
                ),
            })
        );

        expect(parsed).toMatchObject({
            maker: MAKER,
            asset: '123',
            side: 'BUY',
            usdcSize: 20,
            size: 40,
            price: 0.5,
            exchangeVersion: 'v2',
        });
    });

    it('decodes a V1 leader sell', () => {
        const parsed = parseOrderFilledLog(
            log({
                address: POLYMARKET_V1_EXCHANGE_ADDRESSES[0],
                topics: [
                    ORDER_FILLED_V1_TOPIC,
                    orderHash,
                    topicAddress(MAKER),
                    topicAddress(TAKER),
                ],
                data: ethers.utils.defaultAbiCoder.encode(
                    ['uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
                    [456, 0, 50_000_000, 30_000_000, 0]
                ),
            })
        );

        expect(parsed).toMatchObject({
            asset: '456',
            side: 'SELL',
            usdcSize: 30,
            size: 50,
            price: 0.6,
            exchangeVersion: 'v1',
        });
    });
});
