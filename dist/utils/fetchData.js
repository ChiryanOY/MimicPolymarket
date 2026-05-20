"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isNetworkError = (error) => {
    if (axios_1.default.isAxiosError(error)) {
        const axiosError = error;
        const code = axiosError.code;
        // Network timeout/connection errors
        return (code === 'ETIMEDOUT' ||
            code === 'ENETUNREACH' ||
            code === 'ECONNRESET' ||
            code === 'ECONNREFUSED' ||
            !axiosError.response); // No response = network issue
    }
    return false;
};
const fetchData = async (url) => {
    const retries = env_1.ENV.NETWORK_RETRY_LIMIT;
    const timeout = env_1.ENV.REQUEST_TIMEOUT_MS;
    const retryDelay = 1000; // Fixed 1 second delay between retries
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios_1.default.get(url, {
                timeout,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                // Force IPv4 to avoid IPv6 connectivity issues
                family: 4,
            });
            return response.data;
        }
        catch (error) {
            const isLastAttempt = attempt === retries;
            if (isNetworkError(error) && !isLastAttempt) {
                console.warn(`⚠️  Network error (attempt ${attempt}/${retries}), retrying...`);
                await sleep(retryDelay);
                continue;
            }
            // If it's the last attempt or not a network error, throw
            if (isLastAttempt && isNetworkError(error)) {
                console.error(`❌ Network timeout after ${retries} attempts -`, axios_1.default.isAxiosError(error) ? error.code : 'Unknown error');
            }
            throw error;
        }
    }
};
exports.default = fetchData;
