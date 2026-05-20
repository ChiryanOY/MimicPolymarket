"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const ethers_1 = require("ethers");
const clob_client_v2_1 = require("@polymarket/clob-client-v2");
const builder_relayer_client_1 = require("@polymarket/builder-relayer-client");
const builder_signing_sdk_1 = require("@polymarket/builder-relayer-client/node_modules/@polymarket/builder-signing-sdk");
const accounts_1 = require("viem/accounts");
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const env_1 = require("../config/env");
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
];
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
];
const requireBuilderConfig = () => {
    if (!env_1.ENV.BUILDER_CONFIG) {
        throw new Error('Missing builder credentials. Set POLY_BUILDER_API_KEY, POLY_BUILDER_API_SECRET, and POLY_BUILDER_API_PASSPHRASE first.');
    }
    return new builder_signing_sdk_1.BuilderConfig({
        localBuilderCreds: {
            key: env_1.ENV.BUILDER_CONFIG.key,
            secret: env_1.ENV.BUILDER_CONFIG.secret,
            passphrase: env_1.ENV.BUILDER_CONFIG.passphrase,
        },
    });
};
const createRelayClient = () => {
    const account = (0, accounts_1.privateKeyToAccount)(env_1.ENV.PRIVATE_KEY);
    const walletClient = (0, viem_1.createWalletClient)({
        account,
        chain: chains_1.polygon,
        transport: (0, viem_1.http)(env_1.ENV.RPC_URL),
    });
    return new builder_relayer_client_1.RelayClient(env_1.ENV.RELAYER_URL, CHAIN_ID, walletClient, requireBuilderConfig());
};
const printSummary = (ownerWallet, depositWallet) => {
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
const maybeDeployWallet = async (relayClient, depositWallet) => {
    const provider = new ethers_1.ethers.providers.JsonRpcProvider(env_1.ENV.RPC_URL);
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
const maybeApproveContracts = async (relayClient, depositWallet) => {
    const shouldApprove = process.argv.includes('--approve');
    if (!shouldApprove) {
        console.log('ℹ Skipping approval batch. Re-run with `--approve` to set approvals.');
        return;
    }
    const contractConfig = (0, clob_client_v2_1.getContractConfig)(CHAIN_ID);
    const calls = [
        {
            target: env_1.ENV.USDC_CONTRACT_ADDRESS,
            value: '0',
            data: (0, viem_1.encodeFunctionData)({
                abi: ERC20_ABI,
                functionName: 'approve',
                args: [contractConfig.exchangeV2, viem_1.maxUint256],
            }),
        },
        {
            target: contractConfig.conditionalTokens,
            value: '0',
            data: (0, viem_1.encodeFunctionData)({
                abi: ERC1155_ABI,
                functionName: 'setApprovalForAll',
                args: [contractConfig.exchangeV2, true],
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
    const ownerWallet = (0, accounts_1.privateKeyToAccount)(env_1.ENV.PRIVATE_KEY).address;
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
