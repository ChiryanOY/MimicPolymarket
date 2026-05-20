import { ethers } from 'ethers';
import { ClobClient, SignatureTypeV2, Chain } from '@polymarket/clob-client-v2';
import { ENV } from '../config/env';
import Logger from './logger';
import { resolveWalletRuntimeInfo } from './walletMode';

const TRADING_WALLET = ENV.TRADING_WALLET;
const PRIVATE_KEY = ENV.PRIVATE_KEY;
const CLOB_HTTP_URL = ENV.CLOB_HTTP_URL;
const CLOB_BUILDER_CONFIG = ENV.CLOB_BUILDER_CONFIG;

const createClobClient = async (): Promise<ClobClient> => {
    const chain = Chain.POLYGON;
    const host = CLOB_HTTP_URL as string;
    const wallet = new ethers.Wallet(PRIVATE_KEY as string);
    const walletInfo = await resolveWalletRuntimeInfo();
    const signatureType: SignatureTypeV2 = walletInfo.signatureType;
    const funderAddress = walletInfo.funderAddress;
    const walletMode = ENV.WALLET_MODE;

    Logger.info(
        `Wallet mode verified: ${walletMode} (${walletInfo.walletRuntimeType}) | Trading wallet: ${TRADING_WALLET}`
    );

    let clobClient = new ClobClient({
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
    console.log = function () {};
    console.error = function () {};

    const creds = await clobClient.createOrDeriveApiKey();

    clobClient = new ClobClient({
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

export default createClobClient;
