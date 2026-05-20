"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const env_1 = require("../config/env");
const logger_1 = __importDefault(require("./logger"));
const walletMode_1 = require("./walletMode");
const TRADING_WALLET = env_1.ENV.TRADING_WALLET;
const PRIVATE_KEY = env_1.ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = env_1.ENV.CLOB_HTTP_URL;
const CLOB_BUILDER_CONFIG = env_1.ENV.CLOB_BUILDER_CONFIG;
const createClobClient = async () => {
    const chain = clob_client_v2_1.Chain.POLYGON;
    const host = CLOB_HTTP_URL;
    const wallet = new ethers_1.ethers.Wallet(PRIVATE_KEY);
    const walletInfo = await (0, walletMode_1.resolveWalletRuntimeInfo)();
    const signatureType = walletInfo.signatureType;
    const funderAddress = walletInfo.funderAddress;
    const walletMode = env_1.ENV.WALLET_MODE;
    logger_1.default.info(`Wallet mode verified: ${walletMode} (${walletInfo.walletRuntimeType}) | Trading wallet: ${TRADING_WALLET}`);
    let clobClient = new clob_client_v2_1.ClobClient({
        host,
        chain,
        signer: wallet,
        signatureType,
        funderAddress,
        builderConfig: CLOB_BUILDER_CONFIG || undefined,
    });
    // Suppress console output during API key creation
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    console.log = function () { };
    console.error = function () { };
    const creds = await clobClient.createOrDeriveApiKey();
    clobClient = new clob_client_v2_1.ClobClient({
        host,
        chain,
        signer: wallet,
        creds,
        signatureType,
        funderAddress,
        builderConfig: CLOB_BUILDER_CONFIG || undefined,
    });
    // Restore console functions
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    return clobClient;
};
exports.default = createClobClient;
