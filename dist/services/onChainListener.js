"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOnChainListenerHealth = exports.stopOnChainListener = exports.startOnChainListener = exports.scanConfirmedGap = exports.getOrderFilledFilters = void 0;
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const userHistory_1 = require("../models/userHistory");
const logger_1 = __importDefault(require("../utils/logger"));
const marketMetadata_1 = require("./marketMetadata");
const onChainOrderFilled_1 = require("./onChainOrderFilled");
const CURSOR_ID = 'leader-order-filled-confirmed';
const MAX_FILTERED_LEADERS = 50;
const LOG_RETRY_LIMIT = 3;
let httpProvider = null;
let webSocketProvider = null;
let isRunning = false;
let isScanning = false;
let reconnectTimer = null;
let backfillTimer = null;
let lastConfirmedBlock = 0;
let lastSuccessfulBackfillAt = 0;
const inFlightEvents = new Map();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const errorMessage = (error) => error instanceof Error ? error.message : String(error);
const addressTopic = (address) => ethers_1.ethers.utils.hexZeroPad(address.toLowerCase(), 32);
const chunk = (values, size) => {
    const groups = [];
    for (let index = 0; index < values.length; index += size) {
        groups.push(values.slice(index, index + size));
    }
    return groups;
};
const getOrderFilledFilters = (leaderAddresses) => {
    const leaderGroups = chunk([...new Set(leaderAddresses.map((address) => address.toLowerCase()))], MAX_FILTERED_LEADERS);
    return leaderGroups.flatMap((leaders, groupIndex) => {
        const makerTopics = leaders.map(addressTopic);
        return [
            ...onChainOrderFilled_1.POLYMARKET_V1_EXCHANGE_ADDRESSES.map((address) => ({
                label: `V1 OrderFilled leaders group ${groupIndex + 1}`,
                address,
                topics: [onChainOrderFilled_1.ORDER_FILLED_V1_TOPIC, null, makerTopics],
            })),
            ...onChainOrderFilled_1.POLYMARKET_EXCHANGE_ADDRESSES.map((address) => ({
                label: `V2/V3 OrderFilled leaders group ${groupIndex + 1}`,
                address,
                topics: [onChainOrderFilled_1.ORDER_FILLED_TOPIC, null, makerTopics],
            })),
        ];
    });
};
exports.getOrderFilledFilters = getOrderFilledFilters;
const compareLogs = (left, right) => left.blockNumber - right.blockNumber ||
    left.logIndex - right.logIndex ||
    left.transactionHash.localeCompare(right.transactionHash);
const isRetryableRpcError = (error) => /timeout|network|rate limit|too many requests|429|502|503|504|ECONNRESET|ETIMEDOUT/i.test(errorMessage(error));
const isRangeLimitError = (error) => /more than \d+ results|result limit|response size exceeded|too many results|-32005/i.test(errorMessage(error));
const getLogsForRange = async (provider, filter, fromBlock, toBlock) => {
    for (let attempt = 0;; attempt += 1) {
        try {
            return await provider.getLogs({ ...filter, fromBlock, toBlock });
        }
        catch (error) {
            if (isRangeLimitError(error) && fromBlock < toBlock) {
                const middle = Math.floor((fromBlock + toBlock) / 2);
                const [left, right] = await Promise.all([
                    getLogsForRange(provider, filter, fromBlock, middle),
                    getLogsForRange(provider, filter, middle + 1, toBlock),
                ]);
                return [...left, ...right].sort(compareLogs);
            }
            if (attempt >= LOG_RETRY_LIMIT || !isRetryableRpcError(error))
                throw error;
            await delay(500 * 2 ** attempt);
        }
    }
};
const readConfirmedHead = async () => {
    if (!httpProvider)
        throw new Error('HTTP provider is not initialized');
    return Math.max(0, (await httpProvider.getBlockNumber()) - env_1.ENV.CHAIN_CONFIRMATIONS);
};
const persistCursor = async (blockNumber) => {
    const Cursor = (0, userHistory_1.getOnChainCursorModel)();
    await Cursor.updateOne({ _id: CURSOR_ID }, { $set: { blockNumber } }, { upsert: true });
    lastConfirmedBlock = blockNumber;
};
const initializeCursor = async () => {
    const confirmedHead = await readConfirmedHead();
    const Cursor = (0, userHistory_1.getOnChainCursorModel)();
    const cursor = (await Cursor.findById(CURSOR_ID).lean().exec());
    if (!cursor || !Number.isSafeInteger(cursor.blockNumber)) {
        await persistCursor(confirmedHead);
        logger_1.default.info(`[OnChainListener] Initialized confirmed cursor at block ${confirmedHead}; historical trades are not replayed.`);
        return;
    }
    lastConfirmedBlock = Math.min(Number(cursor.blockNumber), confirmedHead);
};
const prepareActivityCollections = async () => {
    for (const leader of env_1.ENV.LEADER_ADDRESSES) {
        const Activity = (0, userHistory_1.getUserActivityModel)(leader);
        await Activity.updateMany({ eventId: { $exists: false }, bot: false, botExcutedTime: 0 }, { $set: { bot: true, botExcutedTime: 999 } });
        await Activity.updateMany({ eventId: { $exists: true }, bot: false, botExcutedTime: 1 }, { $set: { botExcutedTime: 0 } });
    }
};
const saveTrade = async (log, timestamp) => {
    const trade = (0, onChainOrderFilled_1.parseOrderFilledLog)(log);
    if (!trade || !env_1.ENV.LEADER_ADDRESSES.includes(trade.maker))
        return false;
    const eventId = `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
    const existing = inFlightEvents.get(eventId);
    if (existing)
        return existing;
    const saving = (async () => {
        if (trade.exchangeType === 'COMBO') {
            logger_1.default.warning(`[OnChainListener] Skipping atomic copy of V3 combo fill ${eventId}; combo-aware execution is not enabled.`);
            return false;
        }
        const metadata = await (0, marketMetadata_1.ensureMarketMetadata)(trade.asset);
        if (!metadata) {
            throw new Error(`Market metadata was not found for token ${trade.asset}`);
        }
        const Activity = (0, userHistory_1.getUserActivityModel)(trade.maker);
        const result = await Activity.updateOne({ eventId }, {
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
        }, { upsert: true });
        if (result.upsertedCount === 0)
            return false;
        logger_1.default.success(`[OnChainListener] ${trade.side} detected for ${trade.maker.slice(0, 6)}...: ${trade.size.toFixed(2)} shares @ ${trade.price.toFixed(4)} (${metadata.slug || trade.asset})`);
        return true;
    })().finally(() => inFlightEvents.delete(eventId));
    inFlightEvents.set(eventId, saving);
    return saving;
};
const handleWebSocketLog = async (log) => {
    if (!isRunning || log.removed || !httpProvider)
        return;
    try {
        const receipt = await httpProvider.waitForTransaction(log.transactionHash, env_1.ENV.CHAIN_CONFIRMATIONS, Math.max(60_000, env_1.ENV.REQUEST_TIMEOUT_MS));
        if (!receipt || receipt.status !== 1)
            return;
        const block = await httpProvider.getBlock(log.blockNumber);
        if (!block)
            throw new Error(`Block ${log.blockNumber} was not found`);
        await saveTrade(log, Number(block.timestamp));
    }
    catch (error) {
        logger_1.default.error(`[OnChainListener] WSS event failed: ${errorMessage(error)}`);
    }
};
const scanConfirmedGap = async () => {
    if (!isRunning || isScanning || !httpProvider)
        return false;
    isScanning = true;
    try {
        const confirmedHead = await readConfirmedHead();
        if (lastConfirmedBlock >= confirmedHead) {
            lastSuccessfulBackfillAt = Date.now();
            return true;
        }
        const filters = (0, exports.getOrderFilledFilters)(env_1.ENV.LEADER_ADDRESSES);
        for (let fromBlock = lastConfirmedBlock + 1; fromBlock <= confirmedHead; fromBlock += env_1.ENV.ONCHAIN_BACKFILL_CHUNK_BLOCKS) {
            const toBlock = Math.min(confirmedHead, fromBlock + env_1.ENV.ONCHAIN_BACKFILL_CHUNK_BLOCKS - 1);
            const batches = await Promise.all(filters.map((filter) => getLogsForRange(httpProvider, filter, fromBlock, toBlock)));
            const unique = new Map();
            for (const log of batches.flat()) {
                unique.set(`${log.transactionHash}:${log.logIndex}`, log);
            }
            const logs = [...unique.values()].sort(compareLogs);
            const timestamps = new Map();
            for (const log of logs) {
                let timestamp = timestamps.get(log.blockNumber);
                if (timestamp === undefined) {
                    const block = await httpProvider.getBlock(log.blockNumber);
                    if (!block)
                        throw new Error(`Block ${log.blockNumber} was not found`);
                    timestamp = Number(block.timestamp);
                    timestamps.set(log.blockNumber, timestamp);
                }
                await saveTrade(log, timestamp);
            }
            await persistCursor(toBlock);
        }
        lastSuccessfulBackfillAt = Date.now();
        return true;
    }
    catch (error) {
        logger_1.default.error(`[OnChainListener] Confirmed backfill failed: ${errorMessage(error)}`);
        return false;
    }
    finally {
        isScanning = false;
    }
};
exports.scanConfirmedGap = scanConfirmedGap;
const cleanupWebSocket = () => {
    if (!webSocketProvider)
        return;
    webSocketProvider.removeAllListeners();
    const socket = webSocketProvider
        ._websocket;
    try {
        socket?.close?.();
    }
    catch {
        // Socket may already be closed.
    }
    webSocketProvider = null;
};
const scheduleReconnect = (reason) => {
    if (!isRunning || reconnectTimer)
        return;
    logger_1.default.warning(`[OnChainListener] WSS ${reason}; reconnecting shortly.`);
    cleanupWebSocket();
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
    }, env_1.ENV.ONCHAIN_RECONNECT_DELAY_MS);
};
const connectWebSocket = () => {
    if (!isRunning)
        return;
    cleanupWebSocket();
    try {
        const nextProvider = new ethers_1.ethers.providers.WebSocketProvider(env_1.ENV.POLYGON_WSS_URL);
        webSocketProvider = nextProvider;
        for (const filter of (0, exports.getOrderFilledFilters)(env_1.ENV.LEADER_ADDRESSES)) {
            nextProvider.on(filter, (log) => {
                void handleWebSocketLog(log);
            });
        }
        const socket = nextProvider._websocket;
        socket?.on?.('open', () => {
            logger_1.default.success(`[OnChainListener] WSS connected for ${env_1.ENV.LEADER_ADDRESSES.length} leader(s).`);
            void (0, exports.scanConfirmedGap)();
        });
        socket?.on?.('close', () => scheduleReconnect('closed'));
        socket?.on?.('error', (error) => scheduleReconnect(`error: ${errorMessage(error)}`));
    }
    catch (error) {
        scheduleReconnect(`connection failed: ${errorMessage(error)}`);
    }
};
const startOnChainListener = async () => {
    if (isRunning)
        return;
    if (env_1.ENV.LEADER_ADDRESSES.length === 0) {
        throw new Error('LEADER_ADDRESSES is empty');
    }
    isRunning = true;
    httpProvider = new ethers_1.ethers.providers.JsonRpcProvider(env_1.ENV.RPC_URL);
    try {
        await prepareActivityCollections();
        await initializeCursor();
        await (0, exports.scanConfirmedGap)();
        backfillTimer = setInterval(() => {
            void (0, exports.scanConfirmedGap)();
        }, env_1.ENV.ONCHAIN_BACKFILL_INTERVAL_MS);
        connectWebSocket();
        logger_1.default.success('[OnChainListener] On-chain leader signal source started.');
    }
    catch (error) {
        await (0, exports.stopOnChainListener)();
        throw error;
    }
};
exports.startOnChainListener = startOnChainListener;
const stopOnChainListener = async () => {
    isRunning = false;
    if (reconnectTimer)
        clearTimeout(reconnectTimer);
    if (backfillTimer)
        clearInterval(backfillTimer);
    reconnectTimer = null;
    backfillTimer = null;
    cleanupWebSocket();
    httpProvider = null;
    await Promise.allSettled(inFlightEvents.values());
    inFlightEvents.clear();
    logger_1.default.info('[OnChainListener] Stopped.');
};
exports.stopOnChainListener = stopOnChainListener;
const getOnChainListenerHealth = () => ({
    running: isRunning,
    websocketConnected: webSocketProvider !== null,
    scanning: isScanning,
    lastConfirmedBlock,
    lastSuccessfulBackfillAt,
});
exports.getOnChainListenerHealth = getOnChainListenerHealth;
