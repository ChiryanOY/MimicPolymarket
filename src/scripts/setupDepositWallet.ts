import * as dotenv from 'dotenv';
dotenv.config();

import { ethers } from 'ethers';
import { getContractConfig } from '@polymarket/clob-client-v2';
import { RelayClient } from '@polymarket/builder-relayer-client';
import { BuilderConfig as RelayBuilderConfig } from '@polymarket/builder-relayer-client/node_modules/@polymarket/builder-signing-sdk';
import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, http, encodeFunctionData, maxUint256 } from 'viem';
import { polygon } from 'viem/chains';
import { ENV } from '../config/env';

const CHAIN_ID = 137;

const ERC20_ABI = [
    {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
    },
] as const;

const ERC1155_ABI = [
    {
        name: 'setApprovalForAll',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'operator', type: 'address' },
            { name: 'approved', type: 'bool' },
        ],
        outputs: [],
    },
] as const;

const requireBuilderConfig = (): ConstructorParameters<typeof RelayClient>[3] => {
    if (!ENV.BUILDER_CONFIG) {
        throw new Error(
            'Missing builder credentials. Set POLY_BUILDER_API_KEY, POLY_BUILDER_API_SECRET, and POLY_BUILDER_API_PASSPHRASE first.'
        );
    }

    return new RelayBuilderConfig({
        localBuilderCreds: {
            key: ENV.BUILDER_CONFIG.key,
            secret: ENV.BUILDER_CONFIG.secret,
            passphrase: ENV.BUILDER_CONFIG.passphrase,
        },
    });
};

const createRelayClient = () => {
    const account = privateKeyToAccount(ENV.PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(ENV.RPC_URL),
    });

    return new RelayClient(ENV.RELAYER_URL, CHAIN_ID, walletClient, requireBuilderConfig());
};

const printSummary = (ownerWallet: string, depositWallet: string) => {
    console.log('\n✅ Deposit wallet setup summary');
    console.log(`Owner wallet:   ${ownerWallet}`);
    console.log(`Deposit wallet: ${depositWallet}`);
    console.log('\nAdd the following to your .env:\n');
    console.log(`WALLET_MODE='DEPOSIT'`);
    console.log(`TRADING_WALLET='${depositWallet}'`);
    if (!process.env.POLY_BUILDER_CODE) {
        console.log(`POLY_BUILDER_CODE='your-builder-code'`);
    }
    console.log('');
};

const maybeDeployWallet = async (relayClient: RelayClient, depositWallet: string) => {
    const provider = new ethers.providers.JsonRpcProvider(ENV.RPC_URL);
    const code = await provider.getCode(depositWallet);
    if (code !== '0x') {
        console.log('ℹ Deposit wallet already deployed onchain.');
        return;
    }

    console.log('⏳ Deposit wallet not deployed yet. Deploying through relayer...');
    const response = await relayClient.deployDepositWallet();
    const confirmed = await response.wait();
    if (!confirmed) {
        throw new Error('Deposit wallet deployment failed or timed out.');
    }
    console.log(`✅ Deposit wallet deployed. State: ${confirmed.state}`);
};

const maybeApproveContracts = async (relayClient: RelayClient, depositWallet: string) => {
    const shouldApprove = process.argv.includes('--approve');
    if (!shouldApprove) {
        console.log('ℹ Skipping approval batch. Re-run with `--approve` to set approvals.');
        return;
    }

    const contractConfig = getContractConfig(CHAIN_ID);
    const calls = [
        {
            target: ENV.USDC_CONTRACT_ADDRESS,
            value: '0',
            data: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [contractConfig.exchangeV2 as `0x${string}`, maxUint256],
            }),
        },
        {
            target: contractConfig.conditionalTokens,
            value: '0',
            data: encodeFunctionData({
                abi: ERC1155_ABI,
                functionName: 'setApprovalForAll',
                args: [contractConfig.exchangeV2 as `0x${string}`, true],
            }),
        },
    ];

    const deadline = `${Math.floor(Date.now() / 1000) + 600}`;
    console.log('⏳ Sending deposit wallet approval batch...');
    const response = await relayClient.executeDepositWalletBatch(calls, depositWallet, deadline);
    const confirmed = await response.wait();
    if (!confirmed) {
        throw new Error('Deposit wallet approval batch failed or timed out.');
    }
    console.log(`✅ Approval batch confirmed. State: ${confirmed.state}`);
};

const main = async () => {
    const ownerWallet = privateKeyToAccount(ENV.PRIVATE_KEY as `0x${string}`).address;
    const relayClient = createRelayClient();
    const depositWallet = await relayClient.deriveDepositWalletAddress();

    console.log('🔧 Deposit wallet initialization');
    printSummary(ownerWallet, depositWallet);

    await maybeDeployWallet(relayClient, depositWallet);
    await maybeApproveContracts(relayClient, depositWallet);

    console.log('✅ Deposit wallet initialization complete.');
};

main().catch((error) => {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
