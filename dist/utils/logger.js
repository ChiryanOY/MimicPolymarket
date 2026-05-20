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
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class Logger {
    static logsDir = path.join(process.cwd(), 'logs');
    static currentLogFile = '';
    static getLogFileName() {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        return path.join(this.logsDir, `bot-${date}.log`);
    }
    static ensureLogsDir() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }
    static writeToFile(message) {
        try {
            this.ensureLogsDir();
            const logFile = this.getLogFileName();
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}\n`;
            fs.appendFileSync(logFile, logEntry, 'utf8');
        }
        catch (_error) {
            // Silently fail to avoid infinite loops
        }
    }
    static stripAnsi(str) {
        // Remove ANSI color codes for file logging
        return str.replace(/\u001b\[\d+m/g, '');
    }
    static formatAddress(address) {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    static maskAddress(address) {
        // Show 0x and first 4 chars, mask middle, show last 4 chars
        return `${address.slice(0, 6)}${'*'.repeat(34)}${address.slice(-4)}`;
    }
    static header(title) {
        console.log('\n' + chalk_1.default.cyan('━'.repeat(70)));
        console.log(chalk_1.default.cyan.bold(`  ${title}`));
        console.log(chalk_1.default.cyan('━'.repeat(70)) + '\n');
        this.writeToFile(`HEADER: ${title}`);
    }
    static info(message) {
        console.log(chalk_1.default.blue('ℹ'), message);
        this.writeToFile(`INFO: ${message}`);
    }
    static success(message) {
        console.log(chalk_1.default.green('✓'), message);
        this.writeToFile(`SUCCESS: ${message}`);
    }
    static warning(message) {
        console.log(chalk_1.default.yellow('⚠'), message);
        this.writeToFile(`WARNING: ${message}`);
    }
    static error(message) {
        console.log(chalk_1.default.red('✗'), message);
        this.writeToFile(`ERROR: ${message}`);
    }
    static trade(traderAddress, action, details) {
        console.log('\n' + chalk_1.default.magenta('─'.repeat(70)));
        console.log(chalk_1.default.magenta.bold('📊 NEW TRADE DETECTED'));
        console.log(chalk_1.default.gray(`Trader: ${this.formatAddress(traderAddress)}`));
        console.log(chalk_1.default.gray(`Action: ${chalk_1.default.white.bold(action)}`));
        if (details.asset) {
            console.log(chalk_1.default.gray(`Asset:  ${this.formatAddress(details.asset)}`));
        }
        if (details.side) {
            const sideColor = details.side === 'BUY' ? chalk_1.default.green : chalk_1.default.red;
            console.log(chalk_1.default.gray(`Side:   ${sideColor.bold(details.side)}`));
        }
        if (details.amount) {
            console.log(chalk_1.default.gray(`Amount: ${chalk_1.default.yellow(`$${details.amount}`)}`));
        }
        if (details.price) {
            console.log(chalk_1.default.gray(`Price:  ${chalk_1.default.cyan(details.price)}`));
        }
        if (details.eventSlug || details.slug) {
            // Use eventSlug for the correct market URL format
            const slug = details.eventSlug || details.slug;
            const marketUrl = `https://polymarket.com/event/${slug}`;
            console.log(chalk_1.default.gray(`Market: ${chalk_1.default.blue.underline(marketUrl)}`));
        }
        if (details.transactionHash) {
            const txUrl = `https://polygonscan.com/tx/${details.transactionHash}`;
            console.log(chalk_1.default.gray(`TX:     ${chalk_1.default.blue.underline(txUrl)}`));
        }
        console.log(chalk_1.default.magenta('─'.repeat(70)) + '\n');
        // Log to file
        let tradeLog = `TRADE: ${this.formatAddress(traderAddress)} - ${action}`;
        if (details.side)
            tradeLog += ` | Side: ${details.side}`;
        if (details.amount)
            tradeLog += ` | Amount: $${details.amount}`;
        if (details.price)
            tradeLog += ` | Price: ${details.price}`;
        if (details.title)
            tradeLog += ` | Market: ${details.title}`;
        if (details.transactionHash)
            tradeLog += ` | TX: ${details.transactionHash}`;
        this.writeToFile(tradeLog);
    }
    static balance(myBalance, traderBalance, traderAddress) {
        console.log(chalk_1.default.gray('Capital (USDC + Positions):'));
        console.log(chalk_1.default.gray(`  Your total capital:   ${chalk_1.default.green.bold(`$${myBalance.toFixed(2)}`)}`));
        console.log(chalk_1.default.gray(`  Trader total capital: ${chalk_1.default.blue.bold(`$${traderBalance.toFixed(2)}`)} (${this.formatAddress(traderAddress)})`));
    }
    static orderResult(success, message) {
        if (success) {
            console.log(chalk_1.default.green('✓'), chalk_1.default.green.bold('Order executed:'), message);
            this.writeToFile(`ORDER SUCCESS: ${message}`);
        }
        else {
            console.log(chalk_1.default.red('✗'), chalk_1.default.red.bold('Order failed:'), message);
            this.writeToFile(`ORDER FAILED: ${message}`);
        }
    }
    static monitoring(traderCount) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(chalk_1.default.dim(`[${timestamp}]`), chalk_1.default.cyan('👁️  Monitoring'), chalk_1.default.yellow(`${traderCount} trader(s)`));
    }
    static startup(traders, myWallet) {
        console.log('\n');
        console.log(chalk_1.default.cyan('  __  __ ___ __  __ ___ ____ '));
        console.log(chalk_1.default.cyan(' |  \\/  |_ _|  \\/  |_ _/ ___|'));
        console.log(chalk_1.default.cyan.bold(' | |\\/| || || |\\/| || | |    '));
        console.log(chalk_1.default.green.bold(' | |  | || || |  | || | |___ '));
        console.log(chalk_1.default.green(' |_|  |_|___|_|  |_|___\\____|'));
        console.log(chalk_1.default.gray('        Mirror conviction. Execute with discipline.\n'));
        console.log(chalk_1.default.cyan('━'.repeat(70)));
        console.log(chalk_1.default.cyan('📊 Tracking Traders:'));
        traders.forEach((address, index) => {
            console.log(chalk_1.default.gray(`   ${index + 1}. ${address}`));
        });
        console.log(chalk_1.default.cyan(`\n💼 Your Wallet:`));
        console.log(chalk_1.default.gray(`   ${this.maskAddress(myWallet)}\n`));
    }
    static dbConnection(traders, counts) {
        console.log('\n' + chalk_1.default.cyan('📦 Database Status:'));
        traders.forEach((address, index) => {
            const countStr = chalk_1.default.yellow(`${counts[index]} trades`);
            console.log(chalk_1.default.gray(`   ${this.formatAddress(address)}: ${countStr}`));
        });
        console.log('');
    }
    static separator() {
        console.log(chalk_1.default.dim('─'.repeat(70)));
    }
    static spinnerFrames = ['⏳', '⌛', '⏳'];
    static spinnerIndex = 0;
    static waiting(traderCount, extraInfo) {
        const timestamp = new Date().toLocaleTimeString();
        const spinner = this.spinnerFrames[this.spinnerIndex % this.spinnerFrames.length];
        this.spinnerIndex++;
        const message = extraInfo
            ? `${spinner} Waiting for trades from ${traderCount} trader(s)... (${extraInfo})`
            : `${spinner} Waiting for trades from ${traderCount} trader(s)...`;
        process.stdout.write(chalk_1.default.dim(`\r[${timestamp}] `) + chalk_1.default.cyan(message) + '  ');
    }
    static clearLine() {
        process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }
    static myPositions(wallet, count, topPositions, overallPnl, totalValue, initialValue, currentBalance) {
        console.log('\n' + chalk_1.default.magenta.bold('💼 YOUR POSITIONS'));
        console.log(chalk_1.default.gray(`   Wallet: ${this.formatAddress(wallet)}`));
        console.log('');
        // Show balance and portfolio overview
        const balanceStr = chalk_1.default.yellow.bold(`$${currentBalance.toFixed(2)}`);
        const totalPortfolio = currentBalance + totalValue;
        const portfolioStr = chalk_1.default.cyan.bold(`$${totalPortfolio.toFixed(2)}`);
        console.log(chalk_1.default.gray(`   💰 Available Cash:    ${balanceStr}`));
        console.log(chalk_1.default.gray(`   📊 Total Portfolio:   ${portfolioStr}`));
        if (count === 0) {
            console.log(chalk_1.default.gray(`\n   No open positions`));
        }
        else {
            const countStr = chalk_1.default.green(`${count} position${count > 1 ? 's' : ''}`);
            const pnlColor = overallPnl >= 0 ? chalk_1.default.green : chalk_1.default.red;
            const pnlSign = overallPnl >= 0 ? '+' : '';
            const profitStr = pnlColor.bold(`${pnlSign}${overallPnl.toFixed(1)}%`);
            const valueStr = chalk_1.default.cyan(`$${totalValue.toFixed(2)}`);
            const initialStr = chalk_1.default.gray(`$${initialValue.toFixed(2)}`);
            console.log('');
            console.log(chalk_1.default.gray(`   📈 Open Positions:    ${countStr}`));
            console.log(chalk_1.default.gray(`      Invested:          ${initialStr}`));
            console.log(chalk_1.default.gray(`      Current Value:     ${valueStr}`));
            console.log(chalk_1.default.gray(`      Profit/Loss:       ${profitStr}`));
            // Show top positions
            if (topPositions.length > 0) {
                console.log(chalk_1.default.gray(`\n   🔝 Top Positions:`));
                topPositions.forEach((pos) => {
                    const pnlColor = pos.percentPnl >= 0 ? chalk_1.default.green : chalk_1.default.red;
                    const pnlSign = pos.percentPnl >= 0 ? '+' : '';
                    const avgPrice = pos.avgPrice || 0;
                    const curPrice = pos.curPrice || 0;
                    console.log(chalk_1.default.gray(`      • ${pos.outcome} - ${pos.title.slice(0, 45)}${pos.title.length > 45 ? '...' : ''}`));
                    console.log(chalk_1.default.gray(`        Value: ${chalk_1.default.cyan(`$${pos.currentValue.toFixed(2)}`)} | PnL: ${pnlColor(`${pnlSign}${pos.percentPnl.toFixed(1)}%`)}`));
                    console.log(chalk_1.default.gray(`        Bought @ ${chalk_1.default.yellow(`${(avgPrice * 100).toFixed(1)}¢`)} | Current @ ${chalk_1.default.yellow(`${(curPrice * 100).toFixed(1)}¢`)}`));
                });
            }
        }
        console.log('');
    }
    static tradersPositions(traders, positionCounts, positionDetails, profitabilities) {
        console.log('\n' + chalk_1.default.cyan("📈 TRADERS YOU'RE MIMICKING"));
        traders.forEach((address, index) => {
            const count = positionCounts[index];
            const countStr = count > 0
                ? chalk_1.default.green(`${count} position${count > 1 ? 's' : ''}`)
                : chalk_1.default.gray('0 positions');
            // Add profitability if available
            let profitStr = '';
            if (profitabilities && profitabilities[index] !== undefined && count > 0) {
                const pnl = profitabilities[index];
                const pnlColor = pnl >= 0 ? chalk_1.default.green : chalk_1.default.red;
                const pnlSign = pnl >= 0 ? '+' : '';
                profitStr = ` | ${pnlColor.bold(`${pnlSign}${pnl.toFixed(1)}%`)}`;
            }
            console.log(chalk_1.default.gray(`   ${this.formatAddress(address)}: ${countStr}${profitStr}`));
            // Show position details if available
            if (positionDetails && positionDetails[index] && positionDetails[index].length > 0) {
                positionDetails[index].forEach((pos) => {
                    const pnlColor = pos.percentPnl >= 0 ? chalk_1.default.green : chalk_1.default.red;
                    const pnlSign = pos.percentPnl >= 0 ? '+' : '';
                    const avgPrice = pos.avgPrice || 0;
                    const curPrice = pos.curPrice || 0;
                    console.log(chalk_1.default.gray(`      • ${pos.outcome} - ${pos.title.slice(0, 40)}${pos.title.length > 40 ? '...' : ''}`));
                    console.log(chalk_1.default.gray(`        Value: ${chalk_1.default.cyan(`$${pos.currentValue.toFixed(2)}`)} | PnL: ${pnlColor(`${pnlSign}${pos.percentPnl.toFixed(1)}%`)}`));
                    console.log(chalk_1.default.gray(`        Bought @ ${chalk_1.default.yellow(`${(avgPrice * 100).toFixed(1)}¢`)} | Current @ ${chalk_1.default.yellow(`${(curPrice * 100).toFixed(1)}¢`)}`));
                });
            }
        });
        console.log('');
    }
}
exports.default = Logger;
