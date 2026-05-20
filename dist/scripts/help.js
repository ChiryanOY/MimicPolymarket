#!/usr/bin/env ts-node
"use strict";
/**
 * Help command - displays all available bot commands
 */
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};
console.clear();
console.log(`${colors.cyan}${colors.bright}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('     🤖 POLYMARKET MIMIC TRADING BOT - COMMANDS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`${colors.reset}\n`);
console.log(`${colors.yellow}${colors.bright}📖 GETTING STARTED${colors.reset}\n`);
console.log(`  ${colors.green}npm run setup${colors.reset}          Interactive configuration wizard`);
console.log(`  ${colors.green}npm run health-check${colors.reset}   Verify everything is working`);
console.log(`  ${colors.green}npm run build${colors.reset}          Compile TypeScript to JavaScript`);
console.log(`  ${colors.green}npm start${colors.reset}              Start the trading bot`);
console.log(`  ${colors.green}npm run dev${colors.reset}            Run in development mode`);
console.log('');
console.log(`${colors.yellow}${colors.bright}💰 ALLOWANCE${colors.reset}\n`);
console.log(`  ${colors.green}npm run check-allowance${colors.reset}   Verify USDC token allowance`);
console.log(`  ${colors.green}npm run verify-allowance${colors.reset}  Validate allowance and wallet readiness`);
console.log(`  ${colors.green}npm run set-token-allowance${colors.reset}  Set USDC spending approval`);
console.log('');
console.log(`${colors.yellow}${colors.bright}📚 DOCUMENTATION${colors.reset}\n`);
console.log(`  ${colors.cyan}README.md${colors.reset}                 Single source of truth`);
console.log('');
console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
console.log(`${colors.yellow}💡 Quick Tips:${colors.reset}\n`);
console.log('  • New user? Start with: npm run setup');
console.log('  • Before trading: npm run health-check');
console.log('  • Keep README.md open while configuring');
console.log('  • Emergency stop: Press Ctrl+C');
console.log('');
console.log(`${colors.yellow}⚠️  Always start with small amounts and monitor regularly!${colors.reset}\n`);
