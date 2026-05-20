import { AssetType, ClobClient } from '@polymarket/clob-client-v2';
import { UserActivityInterface } from '../interfaces/User';
import Logger from './logger';
import { getRealBalance as getRealBalanceInternal } from './postOrderModules/balance';
import { executeBuyOrder } from './postOrderModules/buy';
import { executeSellOrder } from './postOrderModules/sell';

export const getRealBalance = async (
    clobClient: ClobClient,
    assetType: AssetType,
    tokenId?: string
): Promise<number | null> => {
    return getRealBalanceInternal(clobClient, assetType, tokenId);
};

const postOrder = async (
    clobClient: ClobClient,
    condition: 'buy' | 'sell',
    myPosition: unknown,
    userPosition: unknown,
    trade: UserActivityInterface,
    myBalance: number,
    _userBalance: number,
    userAddress: string,
    myPositions?: unknown[],
    _userPositions?: unknown[]
) => {
    if (condition === 'buy') {
        await executeBuyOrder(clobClient, trade, myBalance, userAddress, myPositions);
        return;
    }

    if (condition === 'sell') {
        await executeSellOrder(
            clobClient,
            trade,
            myPosition,
            userPosition as { size?: string | number } | undefined,
            userAddress
        );
        return;
    }

    Logger.error(`Unknown condition: ${condition}`);
};

export default postOrder;
