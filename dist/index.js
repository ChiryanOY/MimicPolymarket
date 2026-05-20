"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const db_1 = __importStar(require("./config/db"));
const env_1 = require("./config/env");
const createClobClient_1 = __importDefault(require("./utils/createClobClient"));
const tradeExecutor_1 = __importStar(require("./services/tradeExecutor"));
const tradeMonitor_1 = __importStar(require("./services/tradeMonitor"));
const logger_1 = __importDefault(require("./utils/logger"));
const healthCheck_1 = require("./utils/healthCheck");
const myStateManager_1 = require("./services/myStateManager");
// import test from './test/test';
const USER_ADDRESSES = env_1.ENV.USER_ADDRESSES;
const TRADING_WALLET = env_1.ENV.TRADING_WALLET;
// Graceful shutdown handler
let isShuttingDown = false;
const gracefulShutdown = async (signal) => {
    if (isShuttingDown) {
        logger_1.default.warning('Shutdown already in progress, forcing exit...');
        process.exit(1);
    }
    isShuttingDown = true;
    logger_1.default.separator();
    logger_1.default.info(`Received ${signal}, initiating graceful shutdown...`);
    try {
        // Stop services
        (0, tradeMonitor_1.stopTradeMonitor)();
        (0, tradeExecutor_1.stopTradeExecutor)();
        // Give services time to finish current operations
        logger_1.default.info('Waiting for services to finish current operations...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Close database connection
        await (0, db_1.closeDB)();
        logger_1.default.success('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger_1.default.error(`Error during shutdown: ${error}`);
        process.exit(1);
    }
};
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    // Don't exit immediately, let the application try to recover
});
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.default.error(`Uncaught Exception: ${error.message}`);
    // Exit immediately for uncaught exceptions as the application is in an undefined state
    gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
    });
});
// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
const main = async () => {
    try {
        // Welcome message for first-time users
        const colors = {
            reset: '\x1b[0m',
            yellow: '\x1b[33m',
            cyan: '\x1b[36m',
        };
        console.log(`\n${colors.yellow}💡 First time running the bot?${colors.reset}`);
        console.log(`   Read the guide: ${colors.cyan}README.md${colors.reset}`);
        console.log(`   Run health check: ${colors.cyan}npm run health-check${colors.reset}\n`);
        await (0, db_1.default)();
        logger_1.default.startup(USER_ADDRESSES, TRADING_WALLET);
        // Perform initial health check
        logger_1.default.info('Performing initial health check...');
        const healthResult = await (0, healthCheck_1.performHealthCheck)();
        (0, healthCheck_1.logHealthCheck)(healthResult);
        if (!healthResult.healthy) {
            logger_1.default.warning('Health check failed, but continuing startup...');
        }
        logger_1.default.info('Initializing CLOB client...');
        const clobClient = await (0, createClobClient_1.default)();
        logger_1.default.success('CLOB client ready');
        logger_1.default.info('Initializing MyStateManager with API polling...');
        await myStateManager_1.myStateManager.init(clobClient);
        logger_1.default.success('MyStateManager initialized');
        logger_1.default.separator();
        logger_1.default.info('Starting trade monitor...');
        (0, tradeMonitor_1.default)();
        logger_1.default.info('Starting trade executor...');
        (0, tradeExecutor_1.default)(clobClient);
        // test(clobClient);
    }
    catch (error) {
        logger_1.default.error(`Fatal error during startup: ${error}`);
        await gracefulShutdown('startup-error');
    }
};
exports.main = main;
(0, exports.main)();
