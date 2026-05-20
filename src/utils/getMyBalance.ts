import { ethers } from 'ethers';
import { ENV } from '../config/env';
import Logger from './logger';

const RPC_URL = ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = ENV.USDC_CONTRACT_ADDRESS;
const NETWORK_RETRY_LIMIT = ENV.NETWORK_RETRY_LIMIT || 3;
const RETRY_DELAY_MS = ENV.RETRY_DELAY_MS || 2000;

const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Get USDC balance for an address with retry logic
 * @param address Wallet address to check balance
 * @returns Balance in USDC (as number with decimals)
 * @throws Error after all retries are exhausted
 */
const getMyBalance = async (address: string): Promise<number> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= NETWORK_RETRY_LIMIT; attempt++) {
        try {
            const rpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
            const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);
            const balance_usdc = await usdcContract.balanceOf(address);
            const balance_usdc_real = ethers.utils.formatUnits(balance_usdc, 6);
            return parseFloat(balance_usdc_real);
        } catch (error) {
            lastError = error as Error;
            const isLastAttempt = attempt === NETWORK_RETRY_LIMIT;

            if (!isLastAttempt) {
                Logger.warning(
                    `⚠️ RPC balance check failed (attempt ${attempt}/${NETWORK_RETRY_LIMIT}): ${lastError.message} - retrying in ${RETRY_DELAY_MS / 1000}s...`
                );
                await sleep(RETRY_DELAY_MS);
            }
        }
    }

    // All retries exhausted
    Logger.error(
        `❌ Failed to get balance after ${NETWORK_RETRY_LIMIT} attempts: ${lastError?.message}`
    );
    throw lastError || new Error('Failed to get balance: unknown error');
};

export default getMyBalance;
