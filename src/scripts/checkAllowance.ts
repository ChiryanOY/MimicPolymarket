import { ethers } from 'ethers';
import {
    AssetType,
    ClobClient,
    getContractConfig,
    SignatureTypeV2,
    Chain,
} from '@polymarket/clob-client-v2';
import { ENV } from '../config/env';
import { resolveWalletRuntimeInfo } from '../utils/walletMode';

const TRADING_WALLET = ENV.TRADING_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const RPC_URL = ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
const POLYGON_CHAIN_ID = 137;
const POLYMARKET_EXCHANGE = '0xE111180000d2663C0091e4f400237545B87B996B'; // V2 Exchange
const POLYMARKET_EXCHANGE_LOWER = POLYMARKET_EXCHANGE.toLowerCase();
const POLYMARKET_COLLATERAL = getContractConfig(POLYGON_CHAIN_ID).collateral;
const POLYMARKET_COLLATERAL_LOWER = POLYMARKET_COLLATERAL.toLowerCase();
const NATIVE_USDC_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
const NATIVE_USDC_LOWER = NATIVE_USDC_ADDRESS.toLowerCase();

// USDC ABI (only the functions we need)
const USDC_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
];

const buildClobClient = async (provider: ethers.providers.JsonRpcProvider): Promise<ClobClient> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const walletInfo = await resolveWalletRuntimeInfo();
    const signatureType = walletInfo.signatureType;
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () {};
    console.error = function () {};

    const initialClient = new ClobClient({
        host: CLOB_HTTP_URL,
        chain: Chain.POLYGON,
        signer: wallet,
        signatureType,
        funderAddress: walletInfo.funderAddress,
    });

    let creds;
    let createWarning: string | undefined;
    let deriveWarning: string | undefined;
    try {
        try {
            creds = await initialClient.createApiKey();
        } catch (createError: any) {
            const msg = createError?.response?.data?.error || createError?.message;
            createWarning = `⚠️  Unable to create new API key${msg ? `: ${msg}` : ''}`;
        }

        if (!creds?.key) {
            try {
                creds = await initialClient.deriveApiKey();
            } catch (deriveError: any) {
                const msg = deriveError?.response?.data?.error || deriveError?.message;
                deriveWarning = `⚠️  Unable to derive API key${msg ? `: ${msg}` : ''}`;
            }
        }
    } finally {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    }

    if (createWarning) {
        console.log(createWarning);
    }
    if (deriveWarning) {
        console.log(deriveWarning);
    }

    if (!creds?.key) {
        throw new Error('Failed to obtain Polymarket API credentials');
    }

    return new ClobClient({
        host: CLOB_HTTP_URL,
        chain: Chain.POLYGON,
        signer: wallet,
        creds,
        signatureType,
        funderAddress: walletInfo.funderAddress,
    });
};

const formatClobAmount = (raw: string, decimals: number): string => {
    try {
        return ethers.utils.formatUnits(raw, decimals);
    } catch {
        const numeric = parseFloat(raw);
        if (!Number.isFinite(numeric)) {
            return raw;
        }
        return numeric.toFixed(Math.min(decimals, 6));
    }
};

const syncPolymarketAllowanceCache = async (
    decimals: number,
    provider: ethers.providers.JsonRpcProvider
) => {
    try {
        console.log('🔄 Syncing Polymarket allowance cache...');
        const clobClient = await buildClobClient(provider);
        const updateParams = {
            asset_type: AssetType.COLLATERAL,
        } as const;

        const updateResult: any = await clobClient.updateBalanceAllowance(updateParams);
        if (updateResult && typeof updateResult === 'object' && 'error' in updateResult) {
            console.log(`⚠️  Polymarket cache update failed: ${updateResult.error}`);
            return;
        }
        if (updateResult === '' || updateResult === null || updateResult === undefined) {
            console.log('ℹ  Polymarket cache update acknowledged (empty response).');
        } else if (typeof updateResult !== 'object') {
            console.log(
                '⚠️  Polymarket cache update returned an unexpected response:',
                JSON.stringify(updateResult)
            );
        } else {
            console.log('ℹ  Polymarket cache update response:', JSON.stringify(updateResult));
        }

        const balanceResponse: any = await clobClient.getBalanceAllowance(updateParams);
        if (!balanceResponse || typeof balanceResponse !== 'object') {
            console.log(
                '⚠️  Unexpected response from Polymarket when fetching balance/allowance:',
                JSON.stringify(balanceResponse)
            );
            return;
        }

        if ('error' in balanceResponse) {
            console.log(
                `⚠️  Unable to fetch Polymarket balance/allowance: ${balanceResponse.error}`
            );
            return;
        }

        const { balance, allowance } = balanceResponse as {
            balance?: string;
            allowance?: string;
            allowances?: Record<string, string>;
        };
        let allowanceValue: string | undefined = allowance;
        if (!allowanceValue && balanceResponse.allowances) {
            for (const [address, value] of Object.entries(balanceResponse.allowances)) {
                if (
                    address.toLowerCase() === POLYMARKET_EXCHANGE_LOWER &&
                    typeof value === 'string'
                ) {
                    allowanceValue = value;
                    break;
                }
            }
        }

        if (balance === undefined || allowanceValue === undefined) {
            console.log(
                '⚠️  Polymarket did not provide balance/allowance data. Raw response:',
                JSON.stringify(balanceResponse)
            );
            return;
        }

        const syncedBalance = formatClobAmount(balance, decimals);
        const syncedAllowance = formatClobAmount(allowanceValue, decimals);
        console.log(`💾 Polymarket Recorded Balance: ${syncedBalance} USDC`);
        console.log(`💾 Polymarket Recorded Allowance: ${syncedAllowance} USDC\n`);
    } catch (syncError: any) {
        console.log(`⚠️  Unable to sync Polymarket cache: ${syncError?.message || syncError}`);
    }
};

async function checkAndSetAllowance() {
    console.log('🔍 Checking USDC balance and allowance...\n');

    // Connect to Polygon
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);

    try {
        // Get USDC decimals
        const decimals = await usdcContract.decimals();
        console.log(`💵 USDC Decimals: ${decimals}`);

        const usesPolymarketCollateral =
            USDC_CONTRACT_ADDRESS.toLowerCase() === POLYMARKET_COLLATERAL_LOWER;

        // Local token balance & allowance (whatever is configured in .env)
        const localBalance = await usdcContract.balanceOf(TRADING_WALLET);
        const localAllowance = await usdcContract.allowance(TRADING_WALLET, POLYMARKET_EXCHANGE);
        const localBalanceFormatted = ethers.utils.formatUnits(localBalance, decimals);
        const localAllowanceFormatted = ethers.utils.formatUnits(localAllowance, decimals);

        console.log(
            `💰 Your USDC Balance (${USDC_CONTRACT_ADDRESS}): ${localBalanceFormatted} USDC`
        );
        console.log(
            `✅ Current Allowance (${USDC_CONTRACT_ADDRESS}): ${localAllowanceFormatted} USDC`
        );
        console.log(`📍 Polymarket Exchange: ${POLYMARKET_EXCHANGE}\n`);

        if (USDC_CONTRACT_ADDRESS.toLowerCase() !== NATIVE_USDC_LOWER) {
            try {
                const nativeContract = new ethers.Contract(NATIVE_USDC_ADDRESS, USDC_ABI, wallet);
                const nativeDecimals = await nativeContract.decimals();
                const nativeBalance = await nativeContract.balanceOf(TRADING_WALLET);
                if (!nativeBalance.isZero()) {
                    const nativeFormatted = ethers.utils.formatUnits(nativeBalance, nativeDecimals);
                    console.log('ℹ️  Detected native USDC (Polygon PoS) balance:');
                    console.log(`    ${nativeFormatted} tokens at ${NATIVE_USDC_ADDRESS}`);
                    console.log(
                        '    Polymarket does not recognize this token. Swap to USDC.e (0x2791...) to trade.\n'
                    );
                }
            } catch (nativeError) {
                console.log(`⚠️  Unable to check native USDC balance: ${nativeError}`);
            }
        }

        // Determine the contract Polymarket actually reads from (USDC.e)
        const polymarketContract = usesPolymarketCollateral
            ? usdcContract
            : new ethers.Contract(POLYMARKET_COLLATERAL, USDC_ABI, wallet);
        const polymarketDecimals = usesPolymarketCollateral
            ? decimals
            : await polymarketContract.decimals();
        const polymarketBalance = usesPolymarketCollateral
            ? localBalance
            : await polymarketContract.balanceOf(TRADING_WALLET);
        const polymarketAllowance = usesPolymarketCollateral
            ? localAllowance
            : await polymarketContract.allowance(TRADING_WALLET, POLYMARKET_EXCHANGE);

        if (!usesPolymarketCollateral) {
            const polymarketBalanceFormatted = ethers.utils.formatUnits(
                polymarketBalance,
                polymarketDecimals
            );
            const polymarketAllowanceFormatted = ethers.utils.formatUnits(
                polymarketAllowance,
                polymarketDecimals
            );
            console.log('⚠️  Polymarket collateral token is USDC.e (bridged) at address');
            console.log(`    ${POLYMARKET_COLLATERAL}`);
            console.log(`⚠️  Polymarket-tracked USDC balance: ${polymarketBalanceFormatted} USDC`);
            console.log(`⚠️  Polymarket-tracked allowance: ${polymarketAllowanceFormatted} USDC\n`);
            console.log(
                '👉  Swap native USDC to USDC.e or update your .env to point at the collateral token before trading.\n'
            );
        }

        if (polymarketAllowance.lt(polymarketBalance) || polymarketAllowance.isZero()) {
            console.log('⚠️  Allowance is insufficient or zero!');
            console.log('📝 Setting unlimited allowance for Polymarket...\n');

            // Approve unlimited amount (max uint256)
            const maxAllowance = ethers.constants.MaxUint256;

            // Get current gas price and add 50% buffer
            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice
                ? feeData.gasPrice.mul(150).div(100)
                : ethers.utils.parseUnits('50', 'gwei');

            console.log(`⛽ Gas Price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);

            const approveTx = await polymarketContract.approve(POLYMARKET_EXCHANGE, maxAllowance, {
                gasPrice: gasPrice,
                gasLimit: 100000,
            });

            console.log(`⏳ Transaction sent: ${approveTx.hash}`);
            console.log('⏳ Waiting for confirmation...\n');

            const receipt = await approveTx.wait();

            if (receipt.status === 1) {
                console.log('✅ Allowance set successfully!');
                console.log(`🔗 Transaction: https://polygonscan.com/tx/${approveTx.hash}\n`);

                // Verify new allowance
                const newAllowance = await polymarketContract.allowance(
                    TRADING_WALLET,
                    POLYMARKET_EXCHANGE
                );
                const newAllowanceFormatted = ethers.utils.formatUnits(
                    newAllowance,
                    polymarketDecimals
                );
                console.log(`✅ New Allowance: ${newAllowanceFormatted} USDC`);
            } else {
                console.log('❌ Transaction failed!');
            }
        } else {
            console.log('✅ Allowance is already sufficient! No action needed.');
        }

        await syncPolymarketAllowanceCache(polymarketDecimals, provider);
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.log('\n⚠️  You need MATIC for gas fees on Polygon!');
        }
    }
}

checkAndSetAllowance()
    .then(() => {
        console.log('\n✅ Done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
