import { ethers } from 'ethers';
import { ENV } from '../config/env';

const TRADING_WALLET = ENV.TRADING_WALLET;
const RPC_URL = ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;

// Polymarket's CTF Exchange contract address on Polygon
const POLYMARKET_EXCHANGE = '0xE111180000d2663C0091e4f400237545B87B996B'; // V2 Exchange

// USDC ABI (only the functions we need)
const USDC_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function decimals() view returns (uint8)',
];

async function verifyAllowance() {
    console.log('🔍 Verifying USDC allowance status...\n');

    // Connect to Polygon
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

    // Create USDC contract instance (read-only, no wallet needed)
    const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, provider);

    try {
        // Get USDC decimals
        const decimals = await usdcContract.decimals();

        // Check balance
        const balance = await usdcContract.balanceOf(TRADING_WALLET);
        const balanceFormatted = ethers.utils.formatUnits(balance, decimals);

        // Check current allowance
        const currentAllowance = await usdcContract.allowance(TRADING_WALLET, POLYMARKET_EXCHANGE);
        const allowanceFormatted = ethers.utils.formatUnits(currentAllowance, decimals);

        console.log('═'.repeat(70));
        console.log('📊 WALLET STATUS');
        console.log('═'.repeat(70));
        console.log(`💼 Wallet:     ${TRADING_WALLET}`);
        console.log(`💵 USDC:       ${balanceFormatted} USDC`);
        console.log(
            `✅ Allowance:  ${currentAllowance.isZero() ? '0 USDC (NOT SET!)' : allowanceFormatted + ' USDC (SET!)'}`
        );
        console.log(`📍 Exchange:   ${POLYMARKET_EXCHANGE}`);
        console.log('═'.repeat(70));

        if (currentAllowance.isZero()) {
            console.log('\n❌ PROBLEM: Allowance is NOT set!');
            console.log('\n📝 TO FIX: Run the following command:');
            console.log('   npm run check-allowance');
            console.log('\nOR wait for your pending transaction to confirm:');
            console.log('   https://polygonscan.com/address/' + TRADING_WALLET);
            process.exit(1);
        } else if (currentAllowance.lt(balance)) {
            console.log('\n⚠️  WARNING: Allowance is less than your balance!');
            console.log(`   You may not be able to trade your full balance.`);
            console.log(`\n   Balance:   ${balanceFormatted} USDC`);
            console.log(`   Allowance: ${allowanceFormatted} USDC`);
            console.log(`\n   Consider setting unlimited allowance:`);
            console.log('   npm run check-allowance');
            process.exit(1);
        } else {
            console.log('\n✅ SUCCESS: Allowance is properly set!');
            console.log('   You can start trading now.');
            console.log('\n🚀 Start the bot:');
            console.log('   npm run dev');
            process.exit(0);
        }
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

verifyAllowance();
