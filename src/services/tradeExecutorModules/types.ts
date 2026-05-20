import { UserActivityInterface, UserPositionInterface } from '../../interfaces/User';

export interface TradeWithUser extends UserActivityInterface {
    userAddress: string;
}

export interface AggregatedTrade {
    userAddress: string;
    conditionId: string;
    asset: string;
    side: string;
    slug?: string;
    eventSlug?: string;
    trades: TradeWithUser[];
    totalUsdcSize: number;
    averagePrice: number;
    firstTradeTime: number;
    lastTradeTime: number;
    aggregationWindowSeconds: number;
}

export interface TradeExecutionContext {
    myPositions: UserPositionInterface[];
    userPositions: UserPositionInterface[];
    myPosition: UserPositionInterface | undefined;
    userPosition: UserPositionInterface | undefined;
    myBalance: number;
    userBalance: number;
}
