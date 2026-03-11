/**
 * Rhinestone Session Key Management for DCA Automation
 *
 * Smart Sessions enable scoped session keys that allow the backend signer
 * to execute DCA swaps on behalf of the user without further user interaction.
 *
 * Flow:
 * 1. Frontend builds a session and calls experimental_signEnableSession (user signs once)
 * 2. Enable signature + session hashes are stored in the DB
 * 3. Backend reconstructs the SAME session and passes enableData to prepareTransaction
 *
 * The session definition MUST be deterministic: both frontend and backend must produce
 * the same session object (same chain, same actions, same policies, same owner address).
 *
 * IMPORTANT: Smart Sessions is experimental in Rhinestone SDK. Expect breaking changes.
 */

import type { Address, Chain, Hex } from "viem";
import { parseUnits, toFunctionSelector, getAbiItem, erc20Abi } from "viem";
import type { Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeNetwork, defiPandaDcaAbi } from "@/lib/constants/networks";

const DEFAULT_SPENDING_LIMIT_USDC = "1000";
const USDC_DECIMALS = 6;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DcaSession = any;

/**
 * Build a deterministic DCA session definition.
 *
 * Accepts either a full Account (backend with private key) or just an Address (frontend).
 * The resulting session is identical in both cases so that the session hash matches.
 */
export function buildDcaSession(config: {
  backendSigner: Account | Address;
  chain?: Chain;
  inputTokenAddress?: Address;
  dcaContractAddress?: Address;
  spendingLimit?: string;
}): DcaSession {
  const chain = config.chain ?? activeNetwork.chain;
  const inputToken = config.inputTokenAddress ?? activeNetwork.usdc;
  const dcaContract = config.dcaContractAddress ?? activeNetwork.defiPandaDCA;
  const spendingLimit = parseUnits(
    config.spendingLimit || DEFAULT_SPENDING_LIMIT_USDC,
    USDC_DECIMALS,
  );

  const signerAccount =
    typeof config.backendSigner === "string"
      ? ({ address: config.backendSigner, type: "local" } as Account)
      : config.backendSigner;

  return {
    chain,
    owners: {
      type: "ecdsa" as const,
      accounts: [signerAccount],
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
            limits: [{ token: inputToken, amount: spendingLimit }],
          },
        ],
      },
      {
        target: dcaContract,
        selector: toFunctionSelector(
          getAbiItem({ abi: defiPandaDcaAbi, name: "executeDCA" }),
        ),
        policies: [
          {
            type: "spending-limits" as const,
            limits: [{ token: inputToken, amount: spendingLimit }],
          },
        ],
      },
    ],
  };
}

/**
 * Build a session for backend DCA execution using the backend signer private key.
 * The backend signer acts as the session key holder (NOT the account owner).
 */
export function buildBackendDcaSession(config: {
  backendSignerPrivateKey: Hex;
  chain?: Chain;
  inputTokenAddress?: Address;
  dcaContractAddress?: Address;
}) {
  const backendSignerAccount = privateKeyToAccount(config.backendSignerPrivateKey);
  return {
    session: buildDcaSession({ backendSigner: backendSignerAccount, ...config }),
    backendSignerAccount,
  };
}

/**
 * Get the backend signer account from the private key env var.
 */
export function getBackendSignerAccount() {
  const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY as Hex | undefined;
  if (!privateKey) {
    throw new Error("BACKEND_SIGNER_PRIVATE_KEY is required for backend DCA session key operations");
  }
  return privateKeyToAccount(privateKey);
}
