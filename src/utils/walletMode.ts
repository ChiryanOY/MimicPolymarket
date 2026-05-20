import { ethers } from 'ethers';
import { SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { deriveDepositWallet } from '@polymarket/builder-relayer-client';
import { getContractConfig as getRelayerContractConfig } from '@polymarket/builder-relayer-client/dist/config';
import { ENV } from '../config/env';

const CHAIN_ID = 137;

export type WalletRuntimeType = 'EOA' | 'SAFE' | 'DEPOSIT';

export interface WalletRuntimeInfo {
    signerAddress: string;
    tradingWallet: string;
    expectedDepositWallet: string;
    walletRuntimeType: WalletRuntimeType;
    signatureType: SignatureTypeV2;
    funderAddress?: string;
}

const normalizeAddress = (address: string): string => address.toLowerCase();

export const deriveExpectedDepositWallet = (ownerAddress: string): string => {
    const contractConfig = getRelayerContractConfig(CHAIN_ID).DepositWalletContracts;
    return deriveDepositWallet(
        ownerAddress,
        contractConfig.DepositWalletFactory,
        contractConfig.DepositWalletImplementation
    );
};

export const resolveWalletRuntimeInfo = async (): Promise<WalletRuntimeInfo> => {
    const signer = new ethers.Wallet(ENV.PRIVATE_KEY);
    const signerAddress = signer.address;
    const tradingWallet = ENV.TRADING_WALLET;
    const expectedDepositWallet = deriveExpectedDepositWallet(signerAddress);
    const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
    const code = await provider.getCode(tradingWallet);
    const isContractWallet = code !== '0x';
    const isExpectedDepositWallet =
        normalizeAddress(tradingWallet) === normalizeAddress(expectedDepositWallet);

    if (ENV.WALLET_MODE === 'DEPOSIT') {
        if (!isExpectedDepositWallet) {
            throw new Error(
                `WALLET_MODE=DEPOSIT but TRADING_WALLET (${tradingWallet}) does not match the deposit wallet derived from PRIVATE_KEY (${expectedDepositWallet}).`
            );
        }

        if (!isContractWallet) {
            throw new Error(
                `WALLET_MODE=DEPOSIT but TRADING_WALLET (${tradingWallet}) is not deployed onchain as a smart contract wallet. Deploy/approve it first with npm run setup-deposit-wallet.`
            );
        }

        return {
            signerAddress,
            tradingWallet,
            expectedDepositWallet,
            walletRuntimeType: 'DEPOSIT',
            signatureType: SignatureTypeV2.POLY_1271,
            funderAddress: tradingWallet,
        };
    }

    if (isExpectedDepositWallet) {
        throw new Error(
            `WALLET_MODE=LEGACY but TRADING_WALLET (${tradingWallet}) matches the deposit wallet derived from PRIVATE_KEY. Set WALLET_MODE='DEPOSIT' before starting the bot.`
        );
    }

    if (!isContractWallet) {
        if (normalizeAddress(tradingWallet) !== normalizeAddress(signerAddress)) {
            throw new Error(
                `WALLET_MODE=LEGACY with an EOA requires TRADING_WALLET (${tradingWallet}) to match the PRIVATE_KEY signer (${signerAddress}).`
            );
        }

        return {
            signerAddress,
            tradingWallet,
            expectedDepositWallet,
            walletRuntimeType: 'EOA',
            signatureType: SignatureTypeV2.EOA,
        };
    }

    return {
        signerAddress,
        tradingWallet,
        expectedDepositWallet,
        walletRuntimeType: 'SAFE',
        signatureType: SignatureTypeV2.POLY_GNOSIS_SAFE,
        funderAddress: tradingWallet,
    };
};
