#!/usr/bin/env ts-node
"use strict";
/**
 * Interactive Setup Script for Polymarket Mimic Trading Bot
 * Helps users create their .env file with guided prompts
 */
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer.trim());
        });
    });
}
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}
function isValidPrivateKey(key) {
    // With or without 0x prefix
    return /^(0x)?[a-fA-F0-9]{64}$/.test(key);
}
function printHeader() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('     🤖 POLYMARKET MIMIC TRADING BOT - SETUP WIZARD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`${colors.reset}\n`);
    console.log(`${colors.yellow}This wizard will help you create your .env configuration file.${colors.reset}`);
    console.log(`${colors.yellow}Press Ctrl+C at any time to cancel.\n${colors.reset}`);
}
function printSection(title) {
    console.log(`\n${colors.blue}${colors.bright}━━━ ${title} ━━━${colors.reset}\n`);
}
async function setupUserAddresses() {
    printSection('STEP 1: TRADERS TO MIMIC');
    console.log(`${colors.cyan}Find top traders on:${colors.reset}`);
    console.log('  • https://polymarket.com/leaderboard');
    console.log('  • https://predictfolio.com\n');
    console.log(`${colors.yellow}Tip: Look for traders with:${colors.reset}`);
    console.log('  • Positive P&L (green numbers)');
    console.log('  • Win rate above 55%');
    console.log('  • Recent trading activity\n');
    const addresses = [];
    let addingMore = true;
    while (addingMore) {
        const address = await question(`${colors.green}Enter trader wallet address ${addresses.length + 1} (or press Enter to finish): ${colors.reset}`);
        if (!address) {
            if (addresses.length === 0) {
                console.log(`${colors.red}✗ You must add at least one trader address!${colors.reset}\n`);
                continue;
            }
            addingMore = false;
            break;
        }
        if (!isValidEthereumAddress(address.toLowerCase())) {
            console.log(`${colors.red}✗ Invalid Ethereum address format. Should be 0x followed by 40 hex characters.${colors.reset}\n`);
            continue;
        }
        addresses.push(address.toLowerCase());
        console.log(`${colors.green}✓ Added: ${address}${colors.reset}\n`);
    }
    console.log(`\n${colors.green}✓ Total traders to mimic: ${addresses.length}${colors.reset}`);
    return addresses.join(', ');
}
async function setupWallet() {
    printSection('STEP 2: YOUR TRADING WALLET');
    console.log(`${colors.yellow}⚠️  IMPORTANT SECURITY TIPS:${colors.reset}`);
    console.log('  • Use a DEDICATED wallet for the bot');
    console.log('  • Never use your main wallet');
    console.log('  • Only keep trading capital in this wallet');
    console.log('  • Never share your private key!\n');
    let wallet = '';
    while (!wallet) {
        wallet = await question(`${colors.green}Enter your Polygon wallet address: ${colors.reset}`);
        if (!isValidEthereumAddress(wallet)) {
            console.log(`${colors.red}✗ Invalid wallet address format${colors.reset}\n`);
            wallet = '';
            continue;
        }
    }
    console.log(`${colors.green}✓ Wallet: ${wallet}${colors.reset}\n`);
    let privateKey = '';
    while (!privateKey) {
        privateKey = await question(`${colors.green}Enter your private key (without 0x prefix): ${colors.reset}`);
        if (!isValidPrivateKey(privateKey)) {
            console.log(`${colors.red}✗ Invalid private key format${colors.reset}\n`);
            privateKey = '';
            continue;
        }
        // Remove 0x prefix if present
        if (privateKey.startsWith('0x')) {
            privateKey = privateKey.slice(2);
        }
    }
    console.log(`${colors.green}✓ Private key saved${colors.reset}`);
    return { wallet, privateKey };
}
async function setupDatabase() {
    printSection('STEP 3: DATABASE');
    console.log(`${colors.cyan}Free MongoDB Atlas:${colors.reset} https://www.mongodb.com/cloud/atlas/register\n`);
    console.log(`${colors.yellow}Setup steps:${colors.reset}`);
    console.log('  1. Create free account');
    console.log('  2. Create a cluster');
    console.log('  3. Create database user');
    console.log('  4. Whitelist IP: 0.0.0.0/0 (allow all)');
    console.log('  5. Get connection string\n');
    let mongoUri = '';
    while (!mongoUri) {
        mongoUri = await question(`${colors.green}Enter MongoDB connection string: ${colors.reset}`);
        if (!mongoUri.startsWith('mongodb')) {
            console.log(`${colors.red}✗ Invalid MongoDB URI. Should start with 'mongodb://' or 'mongodb+srv://'${colors.reset}\n`);
            mongoUri = '';
            continue;
        }
    }
    console.log(`${colors.green}✓ MongoDB URI saved${colors.reset}`);
    return mongoUri;
}
async function setupRPC() {
    printSection('STEP 4: POLYGON RPC ENDPOINT');
    console.log(`${colors.cyan}Get free RPC endpoint from:${colors.reset}`);
    console.log('  • Infura: https://infura.io (recommended)');
    console.log('  • Alchemy: https://www.alchemy.com');
    console.log('  • Ankr: https://www.ankr.com\n');
    let rpcUrl = '';
    while (!rpcUrl) {
        rpcUrl = await question(`${colors.green}Enter Polygon RPC URL: ${colors.reset}`);
        if (!rpcUrl.startsWith('http')) {
            console.log(`${colors.red}✗ Invalid RPC URL. Should start with 'http://' or 'https://'${colors.reset}\n`);
            rpcUrl = '';
            continue;
        }
    }
    console.log(`${colors.green}✓ RPC URL saved${colors.reset}`);
    return rpcUrl;
}
async function setupStrategy() {
    printSection('STEP 5: TRADING STRATEGY (OPTIONAL)');
    const useDefaults = await question(`${colors.green}Use default strategy settings? (Y/n): ${colors.reset}`);
    if (useDefaults.toLowerCase() === 'n' || useDefaults.toLowerCase() === 'no') {
        const mimicSize = await question(`${colors.green}Mimic size % (default 10.0): ${colors.reset}`);
        return {
            mimicSize: mimicSize || '10.0',
        };
    }
    console.log(`${colors.green}✓ Using default strategy: PERCENTAGE, 10%${colors.reset}`);
    return {
        mimicSize: '10.0',
    };
}
async function setupRiskLimits() {
    printSection('STEP 6: RISK LIMITS (OPTIONAL)');
    const useDefaults = await question(`${colors.green}Use default risk limits? (Y/n): ${colors.reset}`);
    if (useDefaults.toLowerCase() === 'n' || useDefaults.toLowerCase() === 'no') {
        const maxOrder = await question(`${colors.green}Maximum order size in USD (default 100.0): ${colors.reset}`);
        const minOrder = await question(`${colors.green}Minimum order size in USD (default 1.0): ${colors.reset}`);
        return {
            maxOrder: maxOrder || '100.0',
            minOrder: minOrder || '1.0',
        };
    }
    console.log(`${colors.green}✓ Using default limits: Max $100, Min $1${colors.reset}`);
    return { maxOrder: '100.0', minOrder: '1.0' };
}
function generateEnvFile(config) {
    const content = `# ================================================================
# POLYMARKET MIMIC TRADING BOT - CONFIGURATION
# Generated by setup wizard on ${new Date().toLocaleString()}
# ================================================================

# ================================================================
# TRADERS TO MIMIC
# ================================================================
USER_ADDRESSES='${config.USER_ADDRESSES}'

# ================================================================
# YOUR WALLET
# ================================================================
TRADING_WALLET='${config.TRADING_WALLET}'
WALLET_MODE='${config.WALLET_MODE}'
PRIVATE_KEY='${config.PRIVATE_KEY}'

# ================================================================
# DATABASE
# ================================================================
MONGO_URI='${config.MONGO_URI}'

# ================================================================
# BLOCKCHAIN RPC
# ================================================================
RPC_URL='${config.RPC_URL}'

# ================================================================
# POLYMARKET ENDPOINTS (DO NOT CHANGE)
# ================================================================
CLOB_HTTP_URL='${config.CLOB_HTTP_URL}'
CLOB_WS_URL='${config.CLOB_WS_URL}'
USDC_CONTRACT_ADDRESS='${config.USDC_CONTRACT_ADDRESS}'
RELAYER_URL='${config.RELAYER_URL}'

# Optional but recommended for new API users / deposit wallet flow
POLY_BUILDER_API_KEY='${config.POLY_BUILDER_API_KEY || ''}'
POLY_BUILDER_API_SECRET='${config.POLY_BUILDER_API_SECRET || ''}'
POLY_BUILDER_API_PASSPHRASE='${config.POLY_BUILDER_API_PASSPHRASE || ''}'
POLY_BUILDER_CODE='${config.POLY_BUILDER_CODE || ''}'

# ================================================================
# TRADING STRATEGY (Default strategy is PERCENTAGE)
# ================================================================
MIMIC_SIZE='${config.MIMIC_SIZE}'

# ================================================================
# PER-TRADER STRATEGIES (Optional - overrides default for specific traders)
# Format: JSON array of objects with address, mimicSize, maxOrderSizeUSD, etc.
# Example:
# TRADER_STRATEGIES='[{"address":"0xaaa...","mimicSize":10,"maxOrderSizeUSD":100},{"address":"0xbbb...","mimicSize":5,"maxOrderSizeUSD":50}]'
# ================================================================
# TRADER_STRATEGIES=''

# ================================================================
# RISK LIMITS
# ================================================================
MAX_ORDER_SIZE_USD='${config.MAX_ORDER_SIZE_USD}'
MIN_ORDER_SIZE_USD='${config.MIN_ORDER_SIZE_USD}'

# ================================================================
# BOT BEHAVIOR
# ================================================================
FETCH_INTERVAL='${config.FETCH_INTERVAL || '1'}'
RETRY_LIMIT='${config.RETRY_LIMIT || '3'}'


# ================================================================
# NETWORK SETTINGS
# ================================================================
REQUEST_TIMEOUT_MS='10000'
NETWORK_RETRY_LIMIT='3'
`;
    return content;
}
async function main() {
    printHeader();
    try {
        // Collect all configuration
        const userAddresses = await setupUserAddresses();
        const { wallet, privateKey } = await setupWallet();
        const mongoUri = await setupDatabase();
        const rpcUrl = await setupRPC();
        const strategy = await setupStrategy();
        const limits = await setupRiskLimits();
        // Build config object
        const config = {
            USER_ADDRESSES: userAddresses,
            TRADING_WALLET: wallet,
            WALLET_MODE: 'LEGACY',
            PRIVATE_KEY: privateKey,
            MONGO_URI: mongoUri,
            RPC_URL: rpcUrl,
            CLOB_HTTP_URL: 'https://clob.polymarket.com/',
            CLOB_WS_URL: 'wss://ws-subscriptions-clob.polymarket.com/ws',
            USDC_CONTRACT_ADDRESS: '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB',
            RELAYER_URL: 'https://relayer-v2.polymarket.com/',
            MIMIC_SIZE: strategy.mimicSize,
            MAX_ORDER_SIZE_USD: limits.maxOrder,
            MIN_ORDER_SIZE_USD: limits.minOrder,
        };
        // Generate .env file
        printSection('CREATING CONFIGURATION FILE');
        const envContent = generateEnvFile(config);
        const envPath = path.join(process.cwd(), '.env');
        // Check if .env already exists
        if (fs.existsSync(envPath)) {
            const overwrite = await question(`${colors.yellow}⚠️  .env file already exists. Overwrite? (y/N): ${colors.reset}`);
            if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
                console.log(`\n${colors.yellow}Setup cancelled. Your existing .env file was not modified.${colors.reset}`);
                rl.close();
                return;
            }
            // Backup existing file
            const backupPath = path.join(process.cwd(), '.env.backup');
            fs.cpSync(envPath, backupPath);
            console.log(`${colors.green}✓ Backed up existing .env to .env.backup${colors.reset}`);
        }
        // Write .env file
        fs.writeFileSync(envPath, envContent);
        // Success!
        console.log(`\n${colors.green}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log(`${colors.green}${colors.bright}    ✓ SETUP COMPLETE!${colors.reset}`);
        console.log(`${colors.green}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
        console.log(`${colors.cyan}Configuration saved to: ${colors.reset}${envPath}\n`);
        console.log(`${colors.yellow}${colors.bright}📋 PRE-FLIGHT CHECKLIST:${colors.reset}\n`);
        console.log(`  ${colors.red}☐${colors.reset} Fund your wallet with USDC on Polygon`);
        console.log(`  ${colors.red}☐${colors.reset} Get POL (MATIC) for gas fees (~$5-10)`);
        console.log(`  ${colors.red}☐${colors.reset} Verify traders are actively trading`);
        console.log(`  ${colors.red}☐${colors.reset} Test MongoDB connection\n`);
        console.log(`${colors.yellow}${colors.bright}🚀 NEXT STEPS:${colors.reset}\n`);
        console.log(`  1. Review your .env file: ${colors.cyan}cat .env${colors.reset}`);
        console.log(`  2. Install dependencies:   ${colors.cyan}npm install${colors.reset}`);
        console.log(`  3. Build the bot:          ${colors.cyan}npm run build${colors.reset}`);
        console.log(`  4. Run health check:       ${colors.cyan}npm run health-check${colors.reset}`);
        console.log(`  5. Start trading:          ${colors.cyan}npm start${colors.reset}\n`);
        console.log(`${colors.yellow}${colors.bright}📖 DOCUMENTATION:${colors.reset}\n`);
        console.log(`  • Guide:        ${colors.cyan}README.md${colors.reset}\n`);
        console.log(`${colors.red}${colors.bright}⚠️  REMEMBER:${colors.reset}`);
        console.log(`  • Start with small amounts to test`);
        console.log(`  • Monitor the bot regularly`);
        console.log(`  • Only trade what you can afford to lose\n`);
        console.log(`${colors.green}Happy trading! 🎉${colors.reset}\n`);
    }
    catch (error) {
        console.error(`\n${colors.red}Setup error: ${error}${colors.reset}`);
        process.exit(1);
    }
    finally {
        rl.close();
    }
}
// Run the setup wizard
main();
