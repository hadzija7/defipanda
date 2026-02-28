/**
 * Rhinestone Session Key Management for DCA Automation
 *
 * Smart Sessions enable scoped session keys that allow the backend signer
 * to execute DCA swaps on behalf of the user without further user interaction.
 *
 * Flow:
 * 1. Frontend calls `buildDcaSessionConfig` to produce the session definition
 * 2. Frontend enables the session on-chain (user signs once)
 * 3. Backend reconstructs the session and executes DCA transactions using it
 *
 * IMPORTANT: Smart Sessions is experimental in Rhinestone SDK. Expect breaking changes.
 */

import type { Address, Chain, Hex } from "viem";
import { parseUnits, toFunctionSelector, getAbiItem, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import {
  USDC_ADDRESS,
  WETH_ADDRESS,
  UNISWAP_V3_SWAP_ROUTER_02,
  swapRouter02Abi,
} from "@/lib/constants/base-sepolia";

export type DcaSessionConfig = {
  backendSignerAddress: Address;
  inputTokenAddress: Address;
  swapRouterAddress: Address;
  spendingLimitAmount: bigint;
  spendingLimitDecimals: number;
  validityDurationMs: number;
};

export type DcaSessionDefinition = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  backendSignerAddress: Address;
  inputTokenAddress: Address;
  swapRouterAddress: Address;
};

const DEFAULT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_SPENDING_LIMIT_USDC = "1000"; // 1000 USDC
const USDC_DECIMALS = 6;

/**
 * Build a DCA session definition for enabling on-chain.
 *
 * The session grants the backend signer permission to:
 * - Call `approve` on the input token (allow DEX router to pull tokens)
 * - Call `exactInputSingle` on the Uniswap V3 SwapRouter02 (execute the swap)
 * - Up to the spending limit
 * - Within the validity time window
 */
export function buildDcaSessionConfig(config: {
  backendSignerPrivateKey: Hex;
  chain?: Chain;
  inputTokenAddress?: Address;
  swapRouterAddress?: Address;
  spendingLimit?: string;
  spendingLimitDecimals?: number;
  validityDurationMs?: number;
}): DcaSessionDefinition {
  const backendSignerAccount = privateKeyToAccount(config.backendSignerPrivateKey);
  const chain = config.chain ?? baseSepolia;
  const inputToken = config.inputTokenAddress ?? USDC_ADDRESS;
  const swapRouter = config.swapRouterAddress ?? UNISWAP_V3_SWAP_ROUTER_02;
  const spendingLimit = parseUnits(
    config.spendingLimit || DEFAULT_SPENDING_LIMIT_USDC,
    config.spendingLimitDecimals ?? USDC_DECIMALS,
  );
  const validityMs = config.validityDurationMs ?? DEFAULT_VALIDITY_MS;

  const now = Date.now();

  const session = {
    chain,
    owners: {
      type: "ecdsa" as const,
      accounts: [backendSignerAccount],
    },
    actions: [
      {
        target: inputToken,
        selector: toFunctionSelector(
          getAbiItem({ abi: erc20Abi, name: "approve" }),
        ),
        policies: [
          {
            type: "spending-limits" as const,
            limits: [
              {
                token: inputToken,
                amount: spendingLimit,
              },
            ],
          },
          {
            type: "time-frame" as const,
            validAfter: now,
            validUntil: now + validityMs,
          },
        ],
      },
      {
        target: swapRouter,
        selector: toFunctionSelector(
          getAbiItem({ abi: swapRouter02Abi, name: "exactInputSingle" }),
        ),
        policies: [
          {
            type: "spending-limits" as const,
            limits: [
              {
                token: inputToken,
                amount: spendingLimit,
              },
            ],
          },
          {
            type: "time-frame" as const,
            validAfter: now,
            validUntil: now + validityMs,
          },
        ],
      },
    ],
  };

  return {
    session,
    backendSignerAddress: backendSignerAccount.address,
    inputTokenAddress: inputToken,
    swapRouterAddress: swapRouter,
  };
}

/**
 * Build a session for backend DCA execution.
 * Used server-side to reconstruct the session signer for transaction submission.
 */
export function buildBackendDcaSession(config: {
  backendSignerPrivateKey: Hex;
  chain?: Chain;
  inputTokenAddress?: Address;
  swapRouterAddress?: Address;
  spendingLimit?: string;
  spendingLimitDecimals?: number;
  validityDurationMs?: number;
}) {
  return buildDcaSessionConfig(config);
}

/**
 * Get the backend signer account from the private key env var.
 * Used in API routes and server-side code.
 */
export function getBackendSignerAccount() {
  const privateKey = process.env.SMART_ACCOUNT_OWNER_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) {
    throw new Error("SMART_ACCOUNT_OWNER_PRIVATE_KEY is required for backend DCA session key operations");
  }
  return privateKeyToAccount(privateKey);
}

export type StoredSessionData = {
  userAddress: Address;
  smartAccountAddress: Address;
  inputTokenAddress: Address;
  outputTokenAddress: Address;
  swapRouterAddress: Address;
  spendingLimit: string;
  spendingLimitDecimals: number;
  validAfter: number;
  validUntil: number;
  createdAt: number;
};
