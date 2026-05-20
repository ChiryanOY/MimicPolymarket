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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV = void 0;
const dotenv = __importStar(require("dotenv"));
const mimicStrategy_1 = require("./mimicStrategy");
dotenv.config();
/**
 * Validate Ethereum address format
 */
const isValidEthereumAddress = (address) => {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
};
/**
 * Validate required environment variables
 */
const validateRequiredEnv = () => {
    const required = [
        'USER_ADDRESSES',
        'TRADING_WALLET',
        'WALLET_MODE',
        'PRIVATE_KEY',
        'CLOB_HTTP_URL',
        'MONGO_URI',
        'RPC_URL',
        'USDC_CONTRACT_ADDRESS',
    ];
    const missing = [];
    for (const key of required) {
        if (!process.env[key]) {
            missing.push(key);
        }
    }
    if (missing.length > 0) {
        console.error('\n❌ Configuration Error: Missing required environment variables\n');
        console.error(`Missing variables: ${missing.join(', ')}\n`);
        console.error('🔧 Quick fix:');
        console.error('   1. Run the setup wizard: npm run setup');
        console.error('   2. Or manually create .env file with all required variables\n');
        console.error('📖 See README.md for setup instructions\n');
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};
/**
 * Validate Ethereum addresses
 */
const validateAddresses = () => {
    if (process.env.TRADING_WALLET && !isValidEthereumAddress(process.env.TRADING_WALLET)) {
        console.error('\n❌ Invalid Wallet Address\n');
        console.error(`Your TRADING_WALLET: ${process.env.TRADING_WALLET}`);
        console.error('Expected format:    0x followed by 40 hexadecimal characters\n');
        console.error('Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0\n');
        console.error('💡 Tips:');
        console.error('   • Paste your wallet address from MetaMask');
        console.error('   • Make sure it starts with 0x');
        console.error('   • Should be exactly 42 characters long\n');
        throw new Error(`Invalid TRADING_WALLET address format: ${process.env.TRADING_WALLET}`);
    }
    if (process.env.USDC_CONTRACT_ADDRESS &&
        !isValidEthereumAddress(process.env.USDC_CONTRACT_ADDRESS)) {
        console.error('\n❌ Invalid USDC Contract Address\n');
        console.error(`Current value: ${process.env.USDC_CONTRACT_ADDRESS}`);
        console.error('Default value: 0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB\n');
        console.error("⚠️  Unless you know what you're doing, use the default value!\n");
        throw new Error(`Invalid USDC_CONTRACT_ADDRESS format: ${process.env.USDC_CONTRACT_ADDRESS}`);
    }
};
/**
 * Validate numeric configuration values
 */
const validateNumericConfig = () => {
    const fetchInterval = parseFloat(process.env.FETCH_INTERVAL || '1');
    if (isNaN(fetchInterval) || fetchInterval <= 0) {
        throw new Error(`Invalid FETCH_INTERVAL: ${process.env.FETCH_INTERVAL}. Must be a positive number.`);
    }
    const retryLimit = parseInt(process.env.RETRY_LIMIT || '3', 10);
    if (isNaN(retryLimit) || retryLimit < 1 || retryLimit > 10) {
        throw new Error(`Invalid RETRY_LIMIT: ${process.env.RETRY_LIMIT}. Must be between 1 and 10.`);
    }
    const requestTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10);
    if (isNaN(requestTimeout) || requestTimeout < 1000) {
        throw new Error(`Invalid REQUEST_TIMEOUT_MS: ${process.env.REQUEST_TIMEOUT_MS}. Must be at least 1000ms.`);
    }
    const networkRetryLimit = parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10);
    if (isNaN(networkRetryLimit) || networkRetryLimit < 1 || networkRetryLimit > 10) {
        throw new Error(`Invalid NETWORK_RETRY_LIMIT: ${process.env.NETWORK_RETRY_LIMIT}. Must be between 1 and 10.`);
    }
};
const validateWalletMode = () => {
    const walletMode = process.env.WALLET_MODE?.toUpperCase();
    if (!walletMode || (walletMode !== 'LEGACY' && walletMode !== 'DEPOSIT')) {
        throw new Error(`Invalid WALLET_MODE: ${process.env.WALLET_MODE}. Must be either 'LEGACY' or 'DEPOSIT'.`);
    }
};
/**
 * Validate URL formats
 */
const validateUrls = () => {
    if (process.env.CLOB_HTTP_URL && !process.env.CLOB_HTTP_URL.startsWith('http')) {
        console.error('\n❌ Invalid CLOB_HTTP_URL\n');
        console.error(`Current value: ${process.env.CLOB_HTTP_URL}`);
        console.error('Default value: https://clob.polymarket.com/\n');
        console.error('⚠️  Use the default value unless you have a specific reason to change it!\n');
        throw new Error(`Invalid CLOB_HTTP_URL: ${process.env.CLOB_HTTP_URL}. Must be a valid HTTP/HTTPS URL.`);
    }
    if (process.env.RPC_URL && !process.env.RPC_URL.startsWith('http')) {
        console.error('\n❌ Invalid RPC_URL\n');
        console.error(`Current value: ${process.env.RPC_URL}`);
        console.error('Must start with: http:// or https://\n');
        console.error('💡 Get a free RPC endpoint from:');
        console.error('   • Infura:  https://infura.io');
        console.error('   • Alchemy: https://www.alchemy.com');
        console.error('   • Ankr:    https://www.ankr.com\n');
        console.error('Example: https://polygon-mainnet.infura.io/v3/YOUR_PROJECT_ID\n');
        throw new Error(`Invalid RPC_URL: ${process.env.RPC_URL}. Must be a valid HTTP/HTTPS URL.`);
    }
    if (process.env.MONGO_URI && !process.env.MONGO_URI.startsWith('mongodb')) {
        console.error('\n❌ Invalid MONGO_URI\n');
        console.error(`Current value: ${process.env.MONGO_URI}`);
        console.error('Must start with: mongodb:// or mongodb+srv://\n');
        console.error('💡 Setup MongoDB Atlas (free):');
        console.error('   1. Visit https://www.mongodb.com/cloud/atlas/register');
        console.error('   2. Create a free cluster');
        console.error('   3. Create database user with password');
        console.error('   4. Whitelist IP: 0.0.0.0/0 (or your IP)');
        console.error('   5. Get connection string from "Connect" button\n');
        console.error('Example: mongodb+srv://username:password@cluster.mongodb.net/database\n');
        throw new Error(`Invalid MONGO_URI: ${process.env.MONGO_URI}. Must be a valid MongoDB connection string.`);
    }
};
// Run all validations
validateRequiredEnv();
validateAddresses();
validateWalletMode();
validateNumericConfig();
validateUrls();
// Parse USER_ADDRESSES: supports both comma-separated string and JSON array
const parseUserAddresses = (input) => {
    const trimmed = input.trim();
    // Check if it's JSON array format
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                const addresses = parsed
                    .map((addr) => addr.toLowerCase().trim())
                    .filter((addr) => addr.length > 0);
                // Validate each address
                for (const addr of addresses) {
                    if (!isValidEthereumAddress(addr)) {
                        console.error('\n❌ Invalid Trader Address in USER_ADDRESSES\n');
                        console.error(`Invalid address: ${addr}`);
                        console.error('Expected format: 0x followed by 40 hexadecimal characters\n');
                        console.error('💡 Where to find trader addresses:');
                        console.error('   • Polymarket Leaderboard: https://polymarket.com/leaderboard');
                        console.error('   • Predictfolio: https://predictfolio.com\n');
                        console.error("Example: USER_ADDRESSES='0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b'\n");
                        throw new Error(`Invalid Ethereum address in USER_ADDRESSES: ${addr}`);
                    }
                }
                return addresses;
            }
        }
        catch (e) {
            if (e instanceof Error && e.message.includes('Invalid Ethereum address')) {
                throw e;
            }
            throw new Error(`Invalid JSON format for USER_ADDRESSES: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    // Otherwise treat as comma-separated
    const addresses = trimmed
        .split(',')
        .map((addr) => addr.toLowerCase().trim())
        .filter((addr) => addr.length > 0);
    // Validate each address
    for (const addr of addresses) {
        if (!isValidEthereumAddress(addr)) {
            console.error('\n❌ Invalid Trader Address in USER_ADDRESSES\n');
            console.error(`Invalid address: ${addr}`);
            console.error('Expected format: 0x followed by 40 hexadecimal characters\n');
            console.error('💡 Where to find trader addresses:');
            console.error('   • Polymarket Leaderboard: https://polymarket.com/leaderboard');
            console.error('   • Predictfolio: https://predictfolio.com\n');
            console.error("Example: USER_ADDRESSES='0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b'\n");
            throw new Error(`Invalid Ethereum address in USER_ADDRESSES: ${addr}`);
        }
    }
    return addresses;
};
// Parse mimic strategy configuration
const parseMimicStrategy = () => {
    const config = {
        mimicSize: parseFloat(process.env.MIMIC_SIZE || '10.0'),
        maxOrderSizeUSD: parseFloat(process.env.MAX_ORDER_SIZE_USD || '100.0'),
        maxPositionSizeUSD: process.env.MAX_POSITION_SIZE_USD
            ? parseFloat(process.env.MAX_POSITION_SIZE_USD)
            : undefined,
        maxDailyVolumeUSD: process.env.MAX_DAILY_VOLUME_USD
            ? parseFloat(process.env.MAX_DAILY_VOLUME_USD)
            : undefined,
    };
    return config;
};
// Parse per-trader strategies (optional)
const parsePerTraderStrategies = () => {
    const traderStrategiesStr = process.env.TRADER_STRATEGIES;
    if (!traderStrategiesStr || traderStrategiesStr.trim() === '') {
        return new Map();
    }
    try {
        const defaultConfig = parseMimicStrategy();
        const strategiesMap = (0, mimicStrategy_1.parseTraderStrategies)(traderStrategiesStr, defaultConfig);
        if (strategiesMap.size > 0) {
            console.log(`✓ Loaded ${strategiesMap.size} per-trader strategies:`);
            for (const [addr, config] of strategiesMap) {
                const slippageStr = config.buySlippageThreshold !== undefined
                    ? ` slippage: $${config.buySlippageThreshold}`
                    : '';
                console.log(`   • ${addr.slice(0, 6)}...${addr.slice(-4)}: ${config.mimicSize}% (max: $${config.maxOrderSizeUSD})${slippageStr}`);
            }
        }
        return strategiesMap;
    }
    catch (error) {
        console.error(`\n❌ Error parsing TRADER_STRATEGIES:\n${error instanceof Error ? error.message : String(error)}\n`);
        throw error;
    }
};
// Parse Builder API configuration (optional - for gasless trading)
const parseBuilderConfig = () => {
    const key = process.env.POLY_BUILDER_API_KEY;
    const secret = process.env.POLY_BUILDER_API_SECRET;
    const passphrase = process.env.POLY_BUILDER_API_PASSPHRASE;
    // All three must be provided for Builder API to work
    if (key && secret && passphrase) {
        console.log('✓ Builder API credentials configured (gasless trading enabled)');
        return { key, secret, passphrase };
    }
    // If some but not all are provided, warn the user
    if (key || secret || passphrase) {
        console.warn('⚠️ Partial Builder API credentials found. All three required:');
        console.warn('   POLY_BUILDER_API_KEY, POLY_BUILDER_API_SECRET, POLY_BUILDER_API_PASSPHRASE');
        console.warn('   Gasless trading disabled.');
    }
    return null;
};
const parseClobBuilderConfig = () => {
    const builderCode = process.env.POLY_BUILDER_CODE;
    if (!builderCode) {
        return null;
    }
    console.log('✓ Builder code configured for CLOB order attribution');
    return { builderCode };
};
const resolveWalletMode = () => process.env.WALLET_MODE.toUpperCase();
exports.ENV = {
    USER_ADDRESSES: parseUserAddresses(process.env.USER_ADDRESSES),
    WALLET_MODE: resolveWalletMode(),
    TRADING_WALLET: process.env.TRADING_WALLET,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    CLOB_HTTP_URL: process.env.CLOB_HTTP_URL,
    RELAYER_URL: process.env.RELAYER_URL || 'https://relayer-v2.polymarket.com/',
    FETCH_INTERVAL: parseFloat(process.env.FETCH_INTERVAL || '1'),
    RETRY_LIMIT: parseInt(process.env.RETRY_LIMIT || '3', 10),
    // New mimic strategy configuration
    MIMIC_STRATEGY_CONFIG: parseMimicStrategy(),
    // Per-trader strategies (optional - overrides MIMIC_STRATEGY_CONFIG for specific traders)
    TRADER_STRATEGIES_MAP: parsePerTraderStrategies(),
    // Network settings
    REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000', 10),
    NETWORK_RETRY_LIMIT: parseInt(process.env.NETWORK_RETRY_LIMIT || '3', 10),
    // Retry delay for buy/sell orders (in milliseconds)
    RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '2000', 10),
    // Buy slippage threshold (fixed value, e.g., 0.01 = $0.01)
    BUY_SLIPPAGE_THRESHOLD: parseFloat(process.env.BUY_SLIPPAGE_THRESHOLD || '0.01'), // $0.01 default
    // Sell slippage threshold (fixed value, e.g., 0.01 = $0.01)
    SELL_SLIPPAGE_THRESHOLD: parseFloat(process.env.SELL_SLIPPAGE_THRESHOLD || '0.01'), // $0.01 default
    MONGO_URI: process.env.MONGO_URI,
    RPC_URL: process.env.RPC_URL,
    USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS,
    // Builder API configuration (optional - for gasless trading)
    BUILDER_CONFIG: parseBuilderConfig(),
    CLOB_BUILDER_CONFIG: parseClobBuilderConfig(),
};
