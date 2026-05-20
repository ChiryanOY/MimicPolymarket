"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const env_1 = require("../config/env");
const TRADING_WALLET = env_1.ENV.TRADING_WALLET;
const PRIVATE_KEY = env_1.ENV.PRIVATE_KEY;
const RPC_URL = env_1.ENV.RPC_URL;
const POLYGON_CHAIN_ID = 137;
// Polymarket Exchange address where tokens need to be approved
const POLYMARKET_EXCHANGE = '0xE111180000d2663C0091e4f400237545B87B996B'; // V2 Exchange
// CTF (Conditional Token Framework) contract address
const CTF_CONTRACT = (0, clob_client_v2_1.getContractConfig)(POLYGON_CHAIN_ID).conditionalTokens;
// ERC1155 approve for all ABI
const CTF_ABI = [
    'function setApprovalForAll(address operator, bool approved) external',
    'function isApprovedForAll(address account, address operator) view returns (bool)',
];
async function setTokenAllowance() {
    if (env_1.ENV.WALLET_MODE === 'DEPOSIT') {
        throw new Error('WALLET_MODE=DEPOSIT is not supported by this script. Use `npm run setup-deposit-wallet -- --approve` to approve the deposit wallet.');
    }
    console.log('🔑 Setting Token Allowance for Polymarket Trading');
    console.log('═══════════════════════════════════════════════\n');
    const provider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY, provider);
    console.log(`📍 Wallet: ${TRADING_WALLET}`);
    console.log(`📍 CTF Contract: ${CTF_CONTRACT}`);
    console.log(`📍 Polymarket Exchange: ${POLYMARKET_EXCHANGE}\n`);
    try {
        // Create CTF contract instance
        const ctfContract = new ethers_1.ethers.Contract(CTF_CONTRACT, CTF_ABI, wallet);
        // Check current approval status
        console.log('🔍 Checking current approval status...');
        const isApproved = await ctfContract.isApprovedForAll(TRADING_WALLET, POLYMARKET_EXCHANGE);
        if (isApproved) {
            console.log('✅ Tokens are already approved for trading!');
            console.log('✅ You can now sell your positions.\n');
            return;
        }
        console.log('⚠️  Tokens are NOT approved for trading');
        console.log('📝 Setting approval for all tokens...\n');
        // Get current gas price and add 50% buffer
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice
            ? feeData.gasPrice.mul(150).div(100)
            : ethers_1.ethers.utils.parseUnits('50', 'gwei');
        console.log(`⛽ Gas Price: ${ethers_1.ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
        // Approve Polymarket Exchange to trade all your CT tokens
        const tx = await ctfContract.setApprovalForAll(POLYMARKET_EXCHANGE, true, {
            gasPrice: gasPrice,
            gasLimit: 100000,
        });
        console.log(`⏳ Transaction sent: ${tx.hash}`);
        console.log('⏳ Waiting for confirmation...\n');
        const receipt = await tx.wait();
        if (receipt.status === 1) {
            console.log('✅ Success! Tokens are now approved for trading!');
            console.log(`🔗 Transaction: https://polygonscan.com/tx/${tx.hash}\n`);
            // Verify approval
            const newApprovalStatus = await ctfContract.isApprovedForAll(TRADING_WALLET, POLYMARKET_EXCHANGE);
            if (newApprovalStatus) {
                console.log('✅ Verification: Approval confirmed on-chain');
                console.log('✅ You can now start the bot with: npm start\n');
            }
        }
        else {
            console.log('❌ Transaction failed!');
        }
    }
    catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('\n⚠️  You need MATIC for gas fees on Polygon!');
        }
    }
}
setTokenAllowance()
    .then(() => {
    console.log('✅ Done!');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
