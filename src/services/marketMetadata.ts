import fetchData from '../utils/fetchData';

export interface MarketMetadata {
    conditionId: string;
    title: string;
    slug: string;
    eventSlug: string;
    icon: string;
    outcome: string;
    outcomeIndex: number;
    negativeRisk: boolean;
}

type GammaMarket = Record<string, unknown>;

const cache = new Map<string, Promise<MarketMetadata | null>>();

const stringValue = (value: unknown): string => (typeof value === 'string' ? value : '');

const parseStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== 'string') return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
};

const metadataFromGammaMarket = (asset: string, market: GammaMarket): MarketMetadata | null => {
    const tokenIds = parseStringArray(market.clobTokenIds);
    const outcomeIndex = tokenIds.indexOf(asset);
    const conditionId = stringValue(market.conditionId);
    if (outcomeIndex < 0 || !conditionId) return null;

    const outcomes = parseStringArray(market.outcomes);
    const events = Array.isArray(market.events) ? market.events : [];
    const event = (events[0] || {}) as Record<string, unknown>;
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

export const parseGammaMarketMetadata = (
    asset: string,
    payload: unknown
): MarketMetadata | null => {
    if (!Array.isArray(payload)) return null;
    for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        const metadata = metadataFromGammaMarket(asset, item as GammaMarket);
        if (metadata) return metadata;
    }
    return null;
};

/** Resolve token metadata on demand; this is enrichment, not signal polling. */
export const ensureMarketMetadata = async (asset: string): Promise<MarketMetadata | null> => {
    const existing = cache.get(asset);
    if (existing) return existing;

    const lookup = (async () => {
        const query = encodeURIComponent(asset);
        const payload = await fetchData(
            `https://gamma-api.polymarket.com/markets?clob_token_ids=${query}`
        );
        return parseGammaMarketMetadata(asset, payload);
    })();
    cache.set(asset, lookup);
    try {
        const metadata = await lookup;
        if (!metadata) cache.delete(asset);
        return metadata;
    } catch (error) {
        cache.delete(asset);
        throw error;
    }
};

export const clearMarketMetadataCacheForTests = (): void => cache.clear();
