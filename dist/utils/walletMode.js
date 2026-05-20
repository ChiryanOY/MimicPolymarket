"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveWalletRuntimeInfo = exports.deriveExpectedDepositWallet = void 0;
const ethers_1 = require("ethers");
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const builder_relayer_client_1 = require("@polymarket/builder-relayer-client");
const config_1 = require("@polymarket/builder-relayer-client/dist/config");
const env_1 = require("../config/env");
const CHAIN_ID = 137;
const normalizeAddress = (address) => address.toLowerCase();
const deriveExpectedDepositWallet = (ownerAddress) => {
    const contractConfig = (0, config_1.getContractConfig)(CHAIN_ID).DepositWalletContracts;
    return (0, builder_relayer_client_1.deriveDepositWallet)(ownerAddress, contractConfig.DepositWalletFactory, contractConfig.DepositWalletImplementation);
};
exports.deriveExpectedDepositWallet = deriveExpectedDepositWallet;
const resolveWalletRuntimeInfo = async () => {
    const signer = new ethers_1.ethers.Wallet(env_1.ENV.PRIVATE_KEY);
    const signerAddress = signer.address;
    const tradingWallet = env_1.ENV.TRADING_WALLET;
    const expectedDepositWallet = (0, exports.deriveExpectedDepositWallet)(signerAddress);
    const provider = new ethers_1.ethers.providers.JsonRpcProvider(env_1.ENV.RPC_URL);
    const code = await provider.getCode(tradingWallet);
    const isContractWallet = code !== '0x';
    const isExpectedDepositWallet = normalizeAddress(tradingWallet) === normalizeAddress(expectedDepositWallet);
    if (env_1.ENV.WALLET_MODE === 'DEPOSIT') {
        if (!isExpectedDepositWallet) {
            throw new Error(`WALLET_MODE=DEPOSIT but TRADING_WALLET (${tradingWallet}) does not match the deposit wallet derived from PRIVATE_KEY (${expectedDepositWallet}).`);
        }
        if (!isContractWallet) {
            throw new Error(`WALLET_MODE=DEPOSIT but TRADING_WALLET (${tradingWallet}) is not deployed onchain as a smart contract wallet. Deploy/approve it first with npm run setup-deposit-wallet.`);
        }
        return {
            signerAddress,
            tradingWallet,
            expectedDepositWallet,
            walletRuntimeType: 'DEPOSIT',
            signatureType: clob_client_v2_1.SignatureTypeV2.POLY_1271,
            funderAddress: tradingWallet,
        };
    }
    if (isExpectedDepositWallet) {
        throw new Error(`WALLET_MODE=LEGACY but TRADING_WALLET (${tradingWallet}) matches the deposit wallet derived from PRIVATE_KEY. Set WALLET_MODE='DEPOSIT' before starting the bot.`);
    }
    if (!isContractWallet) {
        if (normalizeAddress(tradingWallet) !== normalizeAddress(signerAddress)) {
            throw new Error(`WALLET_MODE=LEGACY with an EOA requires TRADING_WALLET (${tradingWallet}) to match the PRIVATE_KEY signer (${signerAddress}).`);
        }
        return {
            signerAddress,
            tradingWallet,
            expectedDepositWallet,
            walletRuntimeType: 'EOA',
            signatureType: clob_client_v2_1.SignatureTypeV2.EOA,
        };
    }
    return {
        signerAddress,
        tradingWallet,
        expectedDepositWallet,
        walletRuntimeType: 'SAFE',
        signatureType: clob_client_v2_1.SignatureTypeV2.POLY_GNOSIS_SAFE,
        funderAddress: tradingWallet,
    };
};
exports.resolveWalletRuntimeInfo = resolveWalletRuntimeInfo;
