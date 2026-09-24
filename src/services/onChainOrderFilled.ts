import { ethers } from 'ethers';

export type PolymarketExchangeVersion = 'v1' | 'v2' | 'v3';
export type PolymarketExchangeType = 'CTF' | 'NEG_RISK' | 'COMBO' | 'UNKNOWN';

export const POLYMARKET_V1_EXCHANGE_ADDRESSES = [
    '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
    '0xC5d563A36AE78145C45A50134D48fA1215220F80',
].map((address) => address.toLowerCase());

export const POLYMARKET_V2_EXCHANGE_ADDRESSES = [
    '0xE111180000d2663C0091e4f400237545B87B996B',
    '0xe2222d279d744050d28e00520010520000310F59',
].map((address) => address.toLowerCase());

export const POLYMARKET_V3_EXCHANGE_ADDRESSES = ['0xe3333700cA9d93003F00f0F71f8515005F6c00Aa'].map(
    (address) => address.toLowerCase()
);

export const POLYMARKET_EXCHANGE_ADDRESSES = [
    ...POLYMARKET_V2_EXCHANGE_ADDRESSES,
    ...POLYMARKET_V3_EXCHANGE_ADDRESSES,
];

export const ORDER_FILLED_TOPIC = ethers.utils.id(
    'OrderFilled(bytes32,address,address,uint8,uint256,uint256,uint256,uint256,bytes32,bytes32)'
);
export const ORDER_FILLED_V1_TOPIC = ethers.utils.id(
    'OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)'
);

export interface ParsedOrderFilled {
    exchangeVersion: PolymarketExchangeVersion;
    exchangeType: PolymarketExchangeType;
    orderHash: string;
    maker: string;
    taker: string;
    asset: string;
    side: 'BUY' | 'SELL';
    usdcSize: number;
    size: number;
    price: number;
}

const exchangeTypeForAddress = (value: string): PolymarketExchangeType => {
    const address = value.toLowerCase();
    if (POLYMARKET_V3_EXCHANGE_ADDRESSES.includes(address)) return 'COMBO';
    if (
        address === POLYMARKET_V1_EXCHANGE_ADDRESSES[1] ||
        address === POLYMARKET_V2_EXCHANGE_ADDRESSES[1]
    ) {
        return 'NEG_RISK';
    }
    if (
        address === POLYMARKET_V1_EXCHANGE_ADDRESSES[0] ||
        address === POLYMARKET_V2_EXCHANGE_ADDRESSES[0]
    ) {
        return 'CTF';
    }
    return 'UNKNOWN';
};

const addressFromTopic = (topic: string): string => `0x${topic.slice(-40).toLowerCase()}`;

const uint256DataWord = (data: string, index: number): bigint => {
    const start = 2 + index * 64;
    const word = data.slice(start, start + 64);
    if (word.length !== 64) throw new Error(`Missing OrderFilled data word ${index}`);
    return BigInt(`0x${word}`);
};

const amountFromData = (data: string, index: number): number =>
    Number(ethers.utils.formatUnits(uint256DataWord(data, index).toString(), 6));

const buildTrade = (
    base: Omit<ParsedOrderFilled, 'side' | 'usdcSize' | 'size' | 'price'>,
    side: 'BUY' | 'SELL',
    makerAmount: number,
    takerAmount: number
): ParsedOrderFilled | null => {
    const usdcSize = side === 'BUY' ? makerAmount : takerAmount;
    const size = side === 'BUY' ? takerAmount : makerAmount;
    const price = usdcSize / size;
    if (!Number.isFinite(price) || price <= 0 || price > 1.5 || size <= 0) return null;
    return { ...base, side, usdcSize, size, price };
};

/** Decode the order owner's side of a Polymarket OrderFilled log. */
export const parseOrderFilledLog = (log: ethers.providers.Log): ParsedOrderFilled | null => {
    const address = log.address.toLowerCase();
    if (log.topics.length < 4 || !log.topics[0]) return null;

    const base = {
        exchangeVersion: 'v2' as PolymarketExchangeVersion,
        exchangeType: exchangeTypeForAddress(address),
        orderHash: log.topics[1].toLowerCase(),
        maker: addressFromTopic(log.topics[2]),
        taker: addressFromTopic(log.topics[3]),
        asset: '',
    };

    if (POLYMARKET_EXCHANGE_ADDRESSES.includes(address) && log.topics[0] === ORDER_FILLED_TOPIC) {
        const side = uint256DataWord(log.data, 0) === 0n ? 'BUY' : 'SELL';
        const asset = uint256DataWord(log.data, 1).toString();
        const makerAmount = amountFromData(log.data, 2);
        const takerAmount = amountFromData(log.data, 3);
        return buildTrade(
            {
                ...base,
                exchangeVersion: POLYMARKET_V3_EXCHANGE_ADDRESSES.includes(address)
                    ? 'v3'
                    : 'v2',
                asset,
            },
            side,
            makerAmount,
            takerAmount
        );
    }

    if (
        !POLYMARKET_V1_EXCHANGE_ADDRESSES.includes(address) ||
        log.topics[0] !== ORDER_FILLED_V1_TOPIC
    ) {
        return null;
    }

    const makerAssetId = uint256DataWord(log.data, 0);
    const takerAssetId = uint256DataWord(log.data, 1);
    const makerAmount = amountFromData(log.data, 2);
    const takerAmount = amountFromData(log.data, 3);
    const v1Base = { ...base, exchangeVersion: 'v1' as const };

    if (makerAssetId === 0n && takerAssetId > 0n) {
        return buildTrade(
            { ...v1Base, asset: takerAssetId.toString() },
            'BUY',
            makerAmount,
            takerAmount
        );
    }
    if (makerAssetId > 0n && takerAssetId === 0n) {
        return buildTrade(
            { ...v1Base, asset: makerAssetId.toString() },
            'SELL',
            makerAmount,
            takerAmount
        );
    }
    return null;
};
