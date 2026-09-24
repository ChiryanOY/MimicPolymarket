import { ethers } from 'ethers';
import { ENV } from '../config/env';
import { getOnChainCursorModel, getUserActivityModel } from '../models/userHistory';
import Logger from '../utils/logger';
import { ensureMarketMetadata } from './marketMetadata';
import {
    ORDER_FILLED_TOPIC,
    ORDER_FILLED_V1_TOPIC,
    POLYMARKET_EXCHANGE_ADDRESSES,
    POLYMARKET_V1_EXCHANGE_ADDRESSES,
    parseOrderFilledLog,
} from './onChainOrderFilled';

const CURSOR_ID = 'leader-order-filled-confirmed';
const MAX_FILTERED_LEADERS = 50;
const LOG_RETRY_LIMIT = 3;

type OrderFilledFilter = ethers.providers.Filter & { label: string };

let httpProvider: ethers.providers.JsonRpcProvider | null = null;
let webSocketProvider: ethers.providers.WebSocketProvider | null = null;
let isRunning = false;
let isScanning = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let backfillTimer: NodeJS.Timeout | null = null;
let lastConfirmedBlock = 0;
let lastSuccessfulBackfillAt = 0;
const inFlightEvents = new Map<string, Promise<boolean>>();

const delay = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const addressTopic = (address: string): string =>
    ethers.utils.hexZeroPad(address.toLowerCase(), 32);

const chunk = <T>(values: T[], size: number): T[][] => {
    const groups: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        groups.push(values.slice(index, index + size));
    }
    return groups;
};

export const getOrderFilledFilters = (leaderAddresses: string[]): OrderFilledFilter[] => {
    const leaderGroups = chunk(
        [...new Set(leaderAddresses.map((address) => address.toLowerCase()))],
        MAX_FILTERED_LEADERS
    );
    return leaderGroups.flatMap((leaders, groupIndex) => {
        const makerTopics = leaders.map(addressTopic);
        return [
            ...POLYMARKET_V1_EXCHANGE_ADDRESSES.map((address) => ({
                label: `V1 OrderFilled leaders group ${groupIndex + 1}`,
                address,
                topics: [ORDER_FILLED_V1_TOPIC, null, makerTopics],
            })),
            ...POLYMARKET_EXCHANGE_ADDRESSES.map((address) => ({
                label: `V2/V3 OrderFilled leaders group ${groupIndex + 1}`,
                address,
                topics: [ORDER_FILLED_TOPIC, null, makerTopics],
            })),
        ];
    });
};

const compareLogs = (left: ethers.providers.Log, right: ethers.providers.Log): number =>
    left.blockNumber - right.blockNumber ||
    left.logIndex - right.logIndex ||
    left.transactionHash.localeCompare(right.transactionHash);

const isRetryableRpcError = (error: unknown): boolean =>
    /timeout|network|rate limit|too many requests|429|502|503|504|ECONNRESET|ETIMEDOUT/i.test(
        errorMessage(error)
    );

const isRangeLimitError = (error: unknown): boolean =>
    /more than \d+ results|result limit|response size exceeded|too many results|-32005/i.test(
        errorMessage(error)
    );

const getLogsForRange = async (
    provider: ethers.providers.JsonRpcProvider,
    filter: ethers.providers.Filter,
    fromBlock: number,
    toBlock: number
): Promise<ethers.providers.Log[]> => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await provider.getLogs({ ...filter, fromBlock, toBlock });
        } catch (error) {
            if (isRangeLimitError(error) && fromBlock < toBlock) {
                const middle = Math.floor((fromBlock + toBlock) / 2);
                const [left, right] = await Promise.all([
                    getLogsForRange(provider, filter, fromBlock, middle),
                    getLogsForRange(provider, filter, middle + 1, toBlock),
                ]);
                return [...left, ...right].sort(compareLogs);
            }
            if (attempt >= LOG_RETRY_LIMIT || !isRetryableRpcError(error)) throw error;
            await delay(500 * 2 ** attempt);
        }
    }
};

const readConfirmedHead = async (): Promise<number> => {
    if (!httpProvider) throw new Error('HTTP provider is not initialized');
    return Math.max(0, (await httpProvider.getBlockNumber()) - ENV.CHAIN_CONFIRMATIONS);
};

const persistCursor = async (blockNumber: number): Promise<void> => {
    const Cursor = getOnChainCursorModel();
    await Cursor.updateOne(
        { _id: CURSOR_ID },
        { $set: { blockNumber } },
        { upsert: true }
    );
    lastConfirmedBlock = blockNumber;
};

const initializeCursor = async (): Promise<void> => {
    const confirmedHead = await readConfirmedHead();
    const Cursor = getOnChainCursorModel();
    const cursor = (await Cursor.findById(CURSOR_ID).lean().exec()) as
        | { blockNumber?: number }
        | null;
    if (!cursor || !Number.isSafeInteger(cursor.blockNumber)) {
        await persistCursor(confirmedHead);
        Logger.info(
            `[OnChainListener] Initialized confirmed cursor at block ${confirmedHead}; historical trades are not replayed.`
        );
        return;
    }
    lastConfirmedBlock = Math.min(Number(cursor.blockNumber), confirmedHead);
};

const prepareActivityCollections = async (): Promise<void> => {
    for (const leader of ENV.LEADER_ADDRESSES) {
        const Activity = getUserActivityModel(leader);
        await Activity.updateMany(
            { eventId: { $exists: false }, bot: false, botExcutedTime: 0 },
            { $set: { bot: true, botExcutedTime: 999 } }
        );
        await Activity.updateMany(
            { eventId: { $exists: true }, bot: false, botExcutedTime: 1 },
            { $set: { botExcutedTime: 0 } }
        );
    }
};

const saveTrade = async (
    log: ethers.providers.Log,
    timestamp: number
): Promise<boolean> => {
    const trade = parseOrderFilledLog(log);
    if (!trade || !ENV.LEADER_ADDRESSES.includes(trade.maker)) return false;

    const eventId = `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
    const existing = inFlightEvents.get(eventId);
    if (existing) return existing;

    const saving = (async () => {
        if (trade.exchangeType === 'COMBO') {
            Logger.warning(
                `[OnChainListener] Skipping atomic copy of V3 combo fill ${eventId}; combo-aware execution is not enabled.`
            );
            return false;
        }

        const metadata = await ensureMarketMetadata(trade.asset);
        if (!metadata) {
            throw new Error(`Market metadata was not found for token ${trade.asset}`);
        }

        const Activity = getUserActivityModel(trade.maker);
        const result = await Activity.updateOne(
            { eventId },
            {
                $setOnInsert: {
                    eventId,
                    proxyWallet: trade.maker,
                    timestamp,
                    conditionId: metadata.conditionId,
                    type: 'TRADE',
                    size: trade.size,
                    usdcSize: trade.usdcSize,
                    transactionHash: log.transactionHash.toLowerCase(),
                    price: trade.price,
                    asset: trade.asset,
                    side: trade.side,
                    outcomeIndex: metadata.outcomeIndex,
                    title: metadata.title,
                    slug: metadata.slug,
                    icon: metadata.icon,
                    eventSlug: metadata.eventSlug,
                    outcome: metadata.outcome,
                    name: metadata.title,
                    bot: false,
                    botExcutedTime: 0,
                    exchangeVersion: trade.exchangeVersion,
                    exchangeType: trade.exchangeType,
                    blockNumber: log.blockNumber,
                    logIndex: log.logIndex,
                },
            },
            { upsert: true }
        );
        if (result.upsertedCount === 0) return false;

        Logger.success(
            `[OnChainListener] ${trade.side} detected for ${trade.maker.slice(0, 6)}...: ${trade.size.toFixed(2)} shares @ ${trade.price.toFixed(4)} (${metadata.slug || trade.asset})`
        );
        return true;
    })().finally(() => inFlightEvents.delete(eventId));

    inFlightEvents.set(eventId, saving);
    return saving;
};

const handleWebSocketLog = async (log: ethers.providers.Log): Promise<void> => {
    if (!isRunning || log.removed || !httpProvider) return;
    try {
        const receipt = await httpProvider.waitForTransaction(
            log.transactionHash,
            ENV.CHAIN_CONFIRMATIONS,
            Math.max(60_000, ENV.REQUEST_TIMEOUT_MS)
        );
        if (!receipt || receipt.status !== 1) return;
        const block = await httpProvider.getBlock(log.blockNumber);
        if (!block) throw new Error(`Block ${log.blockNumber} was not found`);
        await saveTrade(log, Number(block.timestamp));
    } catch (error) {
        Logger.error(`[OnChainListener] WSS event failed: ${errorMessage(error)}`);
    }
};

export const scanConfirmedGap = async (): Promise<boolean> => {
    if (!isRunning || isScanning || !httpProvider) return false;
    isScanning = true;
    try {
        const confirmedHead = await readConfirmedHead();
        if (lastConfirmedBlock >= confirmedHead) {
            lastSuccessfulBackfillAt = Date.now();
            return true;
        }

        const filters = getOrderFilledFilters(ENV.LEADER_ADDRESSES);
        for (
            let fromBlock = lastConfirmedBlock + 1;
            fromBlock <= confirmedHead;
            fromBlock += ENV.ONCHAIN_BACKFILL_CHUNK_BLOCKS
        ) {
            const toBlock = Math.min(
                confirmedHead,
                fromBlock + ENV.ONCHAIN_BACKFILL_CHUNK_BLOCKS - 1
            );
            const batches = await Promise.all(
                filters.map((filter) => getLogsForRange(httpProvider!, filter, fromBlock, toBlock))
            );
            const unique = new Map<string, ethers.providers.Log>();
            for (const log of batches.flat()) {
                unique.set(`${log.transactionHash}:${log.logIndex}`, log);
            }
            const logs = [...unique.values()].sort(compareLogs);
            const timestamps = new Map<number, number>();
            for (const log of logs) {
                let timestamp = timestamps.get(log.blockNumber);
                if (timestamp === undefined) {
                    const block = await httpProvider.getBlock(log.blockNumber);
                    if (!block) throw new Error(`Block ${log.blockNumber} was not found`);
                    timestamp = Number(block.timestamp);
                    timestamps.set(log.blockNumber, timestamp);
                }
                await saveTrade(log, timestamp);
            }
            await persistCursor(toBlock);
        }
        lastSuccessfulBackfillAt = Date.now();
        return true;
    } catch (error) {
        Logger.error(`[OnChainListener] Confirmed backfill failed: ${errorMessage(error)}`);
        return false;
    } finally {
        isScanning = false;
    }
};

const cleanupWebSocket = (): void => {
    if (!webSocketProvider) return;
    webSocketProvider.removeAllListeners();
    const socket = (webSocketProvider as unknown as { _websocket?: { close?: () => void } })
        ._websocket;
    try {
        socket?.close?.();
    } catch {
        // Socket may already be closed.
    }
    webSocketProvider = null;
};

const scheduleReconnect = (reason: string): void => {
    if (!isRunning || reconnectTimer) return;
    Logger.warning(`[OnChainListener] WSS ${reason}; reconnecting shortly.`);
    cleanupWebSocket();
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
    }, ENV.ONCHAIN_RECONNECT_DELAY_MS);
};

const connectWebSocket = (): void => {
    if (!isRunning) return;
    cleanupWebSocket();
    try {
        const nextProvider = new ethers.providers.WebSocketProvider(ENV.POLYGON_WSS_URL);
        webSocketProvider = nextProvider;
        for (const filter of getOrderFilledFilters(ENV.LEADER_ADDRESSES)) {
            nextProvider.on(filter, (log: ethers.providers.Log) => {
                void handleWebSocketLog(log);
            });
        }

        const socket = (nextProvider as unknown as {
            _websocket?: {
                on?: (event: string, handler: (error?: unknown) => void) => void;
            };
        })._websocket;
        socket?.on?.('open', () => {
            Logger.success(
                `[OnChainListener] WSS connected for ${ENV.LEADER_ADDRESSES.length} leader(s).`
            );
            void scanConfirmedGap();
        });
        socket?.on?.('close', () => scheduleReconnect('closed'));
        socket?.on?.('error', (error) => scheduleReconnect(`error: ${errorMessage(error)}`));
    } catch (error) {
        scheduleReconnect(`connection failed: ${errorMessage(error)}`);
    }
};

export const startOnChainListener = async (): Promise<void> => {
    if (isRunning) return;
    if (ENV.LEADER_ADDRESSES.length === 0) {
        throw new Error('LEADER_ADDRESSES is empty');
    }

    isRunning = true;
    httpProvider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
    try {
        await prepareActivityCollections();
        await initializeCursor();
        await scanConfirmedGap();
        backfillTimer = setInterval(() => {
            void scanConfirmedGap();
        }, ENV.ONCHAIN_BACKFILL_INTERVAL_MS);
        connectWebSocket();
        Logger.success('[OnChainListener] On-chain leader signal source started.');
    } catch (error) {
        await stopOnChainListener();
        throw error;
    }
};

export const stopOnChainListener = async (): Promise<void> => {
    isRunning = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (backfillTimer) clearInterval(backfillTimer);
    reconnectTimer = null;
    backfillTimer = null;
    cleanupWebSocket();
    httpProvider = null;
    await Promise.allSettled(inFlightEvents.values());
    inFlightEvents.clear();
    Logger.info('[OnChainListener] Stopped.');
};

export const getOnChainListenerHealth = () => ({
    running: isRunning,
    websocketConnected: webSocketProvider !== null,
    scanning: isScanning,
    lastConfirmedBlock,
    lastSuccessfulBackfillAt,
});
