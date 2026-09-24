"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearMarketMetadataCacheForTests = exports.ensureMarketMetadata = exports.parseGammaMarketMetadata = void 0;
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const cache = new Map();
const stringValue = (value) => (typeof value === 'string' ? value : '');
const parseStringArray = (value) => {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value !== 'string')
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    catch {
        return [];
    }
};
const metadataFromGammaMarket = (asset, market) => {
    const tokenIds = parseStringArray(market.clobTokenIds);
    const outcomeIndex = tokenIds.indexOf(asset);
    const conditionId = stringValue(market.conditionId);
    if (outcomeIndex < 0 || !conditionId)
        return null;
    const outcomes = parseStringArray(market.outcomes);
    const events = Array.isArray(market.events) ? market.events : [];
    const event = (events[0] || {});
    const title = stringValue(market.question) || stringValue(market.title);
    return {
        conditionId,
        title,
        slug: stringValue(market.slug),
        eventSlug: stringValue(event.slug) || stringValue(market.slug),
        icon: stringValue(market.icon) || stringValue(market.image),
        outcome: outcomes[outcomeIndex] || `Outcome ${outcomeIndex + 1}`,
        outcomeIndex,
        negativeRisk: market.negRisk === true,
    };
};
const parseGammaMarketMetadata = (asset, payload) => {
    if (!Array.isArray(payload))
        return null;
    for (const item of payload) {
        if (!item || typeof item !== 'object')
            continue;
        const metadata = metadataFromGammaMarket(asset, item);
        if (metadata)
            return metadata;
    }
    return null;
};
exports.parseGammaMarketMetadata = parseGammaMarketMetadata;
/** Resolve token metadata on demand; this is enrichment, not signal polling. */
const ensureMarketMetadata = async (asset) => {
    const existing = cache.get(asset);
    if (existing)
        return existing;
    const lookup = (async () => {
        const query = encodeURIComponent(asset);
        const payload = await (0, fetchData_1.default)(`https://gamma-api.polymarket.com/markets?clob_token_ids=${query}`);
        return (0, exports.parseGammaMarketMetadata)(asset, payload);
    })();
    cache.set(asset, lookup);
    try {
        const metadata = await lookup;
        if (!metadata)
            cache.delete(asset);
        return metadata;
    }
    catch (error) {
        cache.delete(asset);
        throw error;
    }
};
exports.ensureMarketMetadata = ensureMarketMetadata;
const clearMarketMetadataCacheForTests = () => cache.clear();
exports.clearMarketMetadataCacheForTests = clearMarketMetadataCacheForTests;
