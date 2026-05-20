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
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const db_1 = __importStar(require("../config/db"));
const healthCheck_1 = require("../utils/healthCheck");
const env_1 = require("../config/env");
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
};
function printHeader() {
    console.log(`\n${colors.cyan}${colors.bright}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('     🏥 POLYMARKET BOT - HEALTH CHECK');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`${colors.reset}\n`);
}
function printRecommendations(result) {
    const issues = [];
    if (result.checks.database.status === 'error') {
        issues.push('❌ Database Connection Failed');
        console.log(`${colors.red}${colors.bright}\n📋 Database Issue:${colors.reset}`);
        console.log('   • Check your MONGO_URI in .env file');
        console.log('   • Verify MongoDB Atlas IP whitelist (allow 0.0.0.0/0)');
        console.log('   • Ensure database user has correct permissions');
        console.log('   • Test connection: https://www.mongodb.com/docs/atlas/troubleshoot-connection\n');
    }
    if (result.checks.rpc.status === 'error') {
        issues.push('❌ RPC Endpoint Failed');
        console.log(`${colors.red}${colors.bright}\n📋 RPC Issue:${colors.reset}`);
        console.log('   • Check your RPC_URL in .env file');
        console.log('   • Verify your API key is valid');
        console.log('   • Try alternative providers:');
        console.log('     - Infura: https://infura.io');
        console.log('     - Alchemy: https://www.alchemy.com\n');
    }
    if (result.checks.balance.status === 'error') {
        issues.push('❌ Zero USDC Balance');
        console.log(`${colors.red}${colors.bright}\n📋 Balance Issue:${colors.reset}`);
        console.log('   • Your wallet has no USDC to trade with');
        console.log('   • Bridge USDC to Polygon: https://wallet.polygon.technology/polygon/bridge/deposit');
        console.log('   • Or buy USDC on an exchange and withdraw to Polygon network');
        console.log('   • Also get POL (MATIC) for gas fees (~$5-10 worth)\n');
    }
    else if (result.checks.balance.status === 'warning') {
        console.log(`${colors.yellow}${colors.bright}\n⚠️  Low Balance Warning:${colors.reset}`);
        console.log(`   • Balance: $${result.checks.balance.balance?.toFixed(2) || '0.00'}`);
        console.log('   • Consider adding more USDC to avoid missing trades');
        console.log('   • Recommended minimum: $50-100 for active trading\n');
    }
    if (result.checks.polymarketApi.status === 'error') {
        issues.push('❌ Polymarket API Failed');
        console.log(`${colors.red}${colors.bright}\n📋 API Issue:${colors.reset}`);
        console.log('   • Polymarket API is not responding');
        console.log('   • Check your internet connection');
        console.log('   • Polymarket may be experiencing downtime');
        console.log('   • Check status: https://polymarket.com\n');
    }
    if (issues.length === 0) {
        console.log(`${colors.green}${colors.bright}\n🎉 All Systems Operational!${colors.reset}\n`);
        console.log(`${colors.cyan}You're ready to start trading:${colors.reset}`);
        console.log(`   ${colors.green}npm start${colors.reset}\n`);
    }
    else {
        console.log(`${colors.red}${colors.bright}\n⚠️  ${issues.length} Issue(s) Found${colors.reset}`);
        console.log(`\n${colors.yellow}Fix the issues above before starting the bot.${colors.reset}\n`);
    }
}
function printConfiguration() {
    console.log(`${colors.cyan}📊 Configuration Summary:${colors.reset}\n`);
    console.log(`   Wallet Mode: ${env_1.ENV.WALLET_MODE}`);
    console.log(`   Trading Wallet: ${env_1.ENV.TRADING_WALLET.slice(0, 6)}...${env_1.ENV.TRADING_WALLET.slice(-4)}`);
    console.log(`   Tracking ${env_1.ENV.USER_ADDRESSES.length} trader(s):`);
    env_1.ENV.USER_ADDRESSES.forEach((addr, idx) => {
        console.log(`      ${idx + 1}. ${addr.slice(0, 6)}...${addr.slice(-4)}`);
    });
    console.log(`   Check Interval: ${env_1.ENV.FETCH_INTERVAL}s`);
    console.log('');
}
const main = async () => {
    try {
        printHeader();
        console.log(`${colors.yellow}⏳ Running diagnostic checks...${colors.reset}\n`);
        await (0, db_1.default)();
        const result = await (0, healthCheck_1.performHealthCheck)();
        (0, healthCheck_1.logHealthCheck)(result);
        printConfiguration();
        printRecommendations(result);
        if (result.healthy) {
            process.exit(0);
        }
        else {
            process.exit(1);
        }
    }
    catch (error) {
        console.error(`\n${colors.red}${colors.bright}❌ Health Check Error${colors.reset}\n`);
        if (error instanceof Error) {
            console.error(`${error.message}\n`);
            console.error(`${colors.yellow}💡 Tip: Run the setup wizard to reconfigure:${colors.reset}`);
            console.error(`   ${colors.cyan}npm run setup${colors.reset}\n`);
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
    finally {
        await (0, db_1.closeDB)();
    }
};
main();
