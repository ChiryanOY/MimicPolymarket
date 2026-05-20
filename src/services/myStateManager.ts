import { ClobClient } from '@polymarket/clob-client-v2';
import { ENV } from '../config/env';
import fetchData from '../utils/fetchData';
import getMyBalance from '../utils/getMyBalance';
import Logger from '../utils/logger';

class MyStateManager {
    private positions: Map<string, any> = new Map();
    private availableBalance: number = 0;
    private clobClient: ClobClient | null = null;
    private isInitialized = false;
    private syncInterval: NodeJS.Timeout | null = null;
    private isSyncing = false;
    private static readonly SYNC_INTERVAL_MS = 5000;

    public async init(clobClient: ClobClient) {
        if (this.isInitialized) return;
        this.clobClient = clobClient;

        await this.syncStateFromAPI();
        this.syncInterval = setInterval(() => {
            this.syncStateFromAPI().catch((err) =>
                Logger.error(`Background state sync failed: ${err}`)
            );
        }, MyStateManager.SYNC_INTERVAL_MS);

        Logger.info(
            `[StateManager] API polling enabled (${MyStateManager.SYNC_INTERVAL_MS / 1000}s interval)`
        );

        this.isInitialized = true;
    }

    private async syncStateFromAPI() {
        if (!this.clobClient || this.isSyncing) return;
        this.isSyncing = true;
        try {
            this.availableBalance = await getMyBalance(ENV.TRADING_WALLET);

            const positionsUrl = `https://data-api.polymarket.com/positions?user=${ENV.TRADING_WALLET}`;
            const positions = await fetchData(positionsUrl);
            if (Array.isArray(positions)) {
                const newPositionsMap = new Map<string, any>();
                for (const pos of positions) {
                    if (pos.asset) {
                        newPositionsMap.set(pos.asset, pos);
                    }
                }
                this.positions = newPositionsMap;
            }
            Logger.info(
                `[StateManager] Synced state from API: Balance $${this.availableBalance.toFixed(2)}, ${this.positions.size} positions.`
            );
        } catch (error) {
            Logger.error(`[StateManager] Failed to sync state from API: ${error}`);
        } finally {
            this.isSyncing = false;
        }
    }

    // --- Public API for synchronous access ---

    public getBalance(): number {
        return this.availableBalance;
    }

    public getPosition(assetId: string): any | undefined {
        return this.positions.get(assetId);
    }

    public getAllPositions(): any[] {
        return Array.from(this.positions.values());
    }
}

export const myStateManager = new MyStateManager();
