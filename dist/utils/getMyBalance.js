"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("./logger"));
const RPC_URL = env_1.ENV.RPC_URL;
const USDC_CONTRACT_ADDRESS = env_1.ENV.USDC_CONTRACT_ADDRESS;
const NETWORK_RETRY_LIMIT = env_1.ENV.NETWORK_RETRY_LIMIT || 3;
const RETRY_DELAY_MS = env_1.ENV.RETRY_DELAY_MS || 2000;
const USDC_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Get USDC balance for an address with retry logic
 * @param address Wallet address to check balance
 * @returns Balance in USDC (as number with decimals)
 * @throws Error after all retries are exhausted
 */
const getMyBalance = async (address) => {
    let lastError = null;
    for (let attempt = 1; attempt <= NETWORK_RETRY_LIMIT; attempt++) {
        try {
            const rpcProvider = new ethers_1.ethers.providers.JsonRpcProvider(RPC_URL);
            const usdcContract = new ethers_1.ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, rpcProvider);
            const balance_usdc = await usdcContract.balanceOf(address);
            const balance_usdc_real = ethers_1.ethers.utils.formatUnits(balance_usdc, 6);
            return parseFloat(balance_usdc_real);
        }
        catch (error) {
            lastError = error;
            const isLastAttempt = attempt === NETWORK_RETRY_LIMIT;
            if (!isLastAttempt) {
                logger_1.default.warning(`⚠️ RPC balance check failed (attempt ${attempt}/${NETWORK_RETRY_LIMIT}): ${lastError.message} - retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    // All retries exhausted
    logger_1.default.error(`❌ Failed to get balance after ${NETWORK_RETRY_LIMIT} attempts: ${lastError?.message}`);
    throw lastError || new Error('Failed to get balance: unknown error');
};
exports.default = getMyBalance;
