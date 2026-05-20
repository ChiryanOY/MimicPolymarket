"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.myStateManager = void 0;
const env_1 = require("../config/env");
const fetchData_1 = __importDefault(require("../utils/fetchData"));
const getMyBalance_1 = __importDefault(require("../utils/getMyBalance"));
const logger_1 = __importDefault(require("../utils/logger"));
class MyStateManager {
    positions = new Map();
    availableBalance = 0;
    clobClient = null;
    isInitialized = false;
    syncInterval = null;
    isSyncing = false;
    static SYNC_INTERVAL_MS = 5000;
    async init(clobClient) {
        if (this.isInitialized)
            return;
        this.clobClient = clobClient;
        await this.syncStateFromAPI();
        this.syncInterval = setInterval(() => {
            this.syncStateFromAPI().catch((err) => logger_1.default.error(`Background state sync failed: ${err}`));
        }, MyStateManager.SYNC_INTERVAL_MS);
        logger_1.default.info(`[StateManager] API polling enabled (${MyStateManager.SYNC_INTERVAL_MS / 1000}s interval)`);
        this.isInitialized = true;
    }
    async syncStateFromAPI() {
        if (!this.clobClient || this.isSyncing)
            return;
        this.isSyncing = true;
        try {
            this.availableBalance = await (0, getMyBalance_1.default)(env_1.ENV.TRADING_WALLET);
            const positionsUrl = `https://data-api.polymarket.com/positions?user=${env_1.ENV.TRADING_WALLET}`;
            const positions = await (0, fetchData_1.default)(positionsUrl);
            if (Array.isArray(positions)) {
                const newPositionsMap = new Map();
                for (const pos of positions) {
                    if (pos.asset) {
                        newPositionsMap.set(pos.asset, pos);
                    }
                }
                this.positions = newPositionsMap;
            }
            logger_1.default.info(`[StateManager] Synced state from API: Balance $${this.availableBalance.toFixed(2)}, ${this.positions.size} positions.`);
        }
        catch (error) {
            logger_1.default.error(`[StateManager] Failed to sync state from API: ${error}`);
        }
        finally {
            this.isSyncing = false;
        }
    }
    // --- Public API for synchronous access ---
    getBalance() {
        return this.availableBalance;
    }
    getPosition(assetId) {
        return this.positions.get(assetId);
    }
    getAllPositions() {
        return Array.from(this.positions.values());
    }
}
exports.myStateManager = new MyStateManager();
