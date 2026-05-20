"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logHealthCheck = exports.performHealthCheck = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../config/env");
const getMyBalance_1 = __importDefault(require("./getMyBalance"));
const fetchData_1 = __importDefault(require("./fetchData"));
const logger_1 = __importDefault(require("./logger"));
/**
 * Perform health check on all critical components
 */
const performHealthCheck = async () => {
    const checks = {
        database: { status: 'error', message: 'Not checked' },
        rpc: { status: 'error', message: 'Not checked' },
        balance: { status: 'error', message: 'Not checked' },
        polymarketApi: { status: 'error', message: 'Not checked' },
    };
    // Check MongoDB connection
    try {
        if (mongoose_1.default.connection.readyState === 1) {
            // Ping the database
            if (mongoose_1.default.connection.db) {
                await mongoose_1.default.connection.db.admin().ping();
                checks.database = { status: 'ok', message: 'Connected' };
            }
            else {
                checks.database = { status: 'error', message: 'Database object not available' };
            }
        }
        else {
            checks.database = {
                status: 'error',
                message: `Connection state: ${mongoose_1.default.connection.readyState}`,
            };
        }
    }
    catch (error) {
        checks.database = {
            status: 'error',
            message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    // Check RPC endpoint
    try {
        const response = await fetch(env_1.ENV.RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_blockNumber',
                params: [],
                id: 1,
            }),
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });
        if (response.ok) {
            const data = await response.json();
            if (data.result) {
                checks.rpc = { status: 'ok', message: 'RPC endpoint responding' };
            }
            else {
                checks.rpc = { status: 'error', message: 'Invalid RPC response' };
            }
        }
        else {
            checks.rpc = { status: 'error', message: `HTTP ${response.status}` };
        }
    }
    catch (error) {
        checks.rpc = {
            status: 'error',
            message: `RPC check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    // Check USDC balance
    try {
        const balance = await (0, getMyBalance_1.default)(env_1.ENV.TRADING_WALLET);
        if (balance > 0) {
            if (balance < 10) {
                checks.balance = {
                    status: 'warning',
                    message: `Low balance: $${balance.toFixed(2)}`,
                    balance,
                };
            }
            else {
                checks.balance = {
                    status: 'ok',
                    message: `Balance: $${balance.toFixed(2)}`,
                    balance,
                };
            }
        }
        else {
            checks.balance = { status: 'error', message: 'Zero balance' };
        }
    }
    catch (error) {
        checks.balance = {
            status: 'error',
            message: `Balance check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    // Check Polymarket API
    try {
        const testUrl = 'https://data-api.polymarket.com/positions?user=0x0000000000000000000000000000000000000000';
        await (0, fetchData_1.default)(testUrl);
        checks.polymarketApi = { status: 'ok', message: 'API responding' };
    }
    catch (error) {
        checks.polymarketApi = {
            status: 'error',
            message: `API check failed: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    // Determine overall health
    const healthy = checks.database.status === 'ok' &&
        checks.rpc.status === 'ok' &&
        checks.balance.status !== 'error' &&
        checks.polymarketApi.status === 'ok';
    return {
        healthy,
        checks,
        timestamp: Date.now(),
    };
};
exports.performHealthCheck = performHealthCheck;
/**
 * Log health check results
 */
const logHealthCheck = (result) => {
    logger_1.default.separator();
    logger_1.default.header('🏥 HEALTH CHECK');
    logger_1.default.info(`Overall Status: ${result.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    logger_1.default.info(`Database: ${result.checks.database.status === 'ok' ? '✅' : '❌'} ${result.checks.database.message}`);
    logger_1.default.info(`RPC: ${result.checks.rpc.status === 'ok' ? '✅' : '❌'} ${result.checks.rpc.message}`);
    logger_1.default.info(`Balance: ${result.checks.balance.status === 'ok' ? '✅' : result.checks.balance.status === 'warning' ? '⚠️' : '❌'} ${result.checks.balance.message}`);
    logger_1.default.info(`Polymarket API: ${result.checks.polymarketApi.status === 'ok' ? '✅' : '❌'} ${result.checks.polymarketApi.message}`);
    logger_1.default.separator();
};
exports.logHealthCheck = logHealthCheck;
