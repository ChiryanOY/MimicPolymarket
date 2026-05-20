import { AssetType, ClobClient } from '@polymarket/clob-client-v2';
import Logger from '../logger';

export const getRealBalance = async (
    clobClient: ClobClient,
    assetType: AssetType,
    tokenId?: string
): Promise<number | null> => {
    try {
        const params: { asset_type: AssetType; token_id?: string } = { asset_type: assetType };
        if (tokenId) {
            params.token_id = tokenId;
        }

        const response = (await clobClient.getBalanceAllowance(params)) as {
            balance?: string | number;
        };

        if (response && response.balance !== undefined) {
            const rawBalance = parseFloat(String(response.balance));
            if (!isNaN(rawBalance)) {
                return rawBalance / 1000000;
            }
        }
        return null;
    } catch (error) {
        Logger.warning(`⚠️ Failed to fetch real CLOB balance for ${assetType}: ${error}`);
        return null;
    }
};
