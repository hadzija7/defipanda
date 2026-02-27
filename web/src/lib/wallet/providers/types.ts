/**
 * Smart Account Provider Types
 *
 * Defines the contracts for smart account providers.
 * Each provider handles provisioning and UserOp execution differently.
 */

import type { Address, Hex, Abi } from "viem";

export type SmartAccountProviderId = "zerodev" | "walletconnect" | "reown_appkit";

export type SmartAccountProviderCapabilities = {
  /** Provider supports server-side provisioning */
  serverProvisioning: boolean;
  /** Provider supports UserOp submission */
  userOpSubmission: boolean;
  /** Provider requires external wallet connection */
  externalWallet: boolean;
};

export type SmartAccountProviderMetadata = {
  id: SmartAccountProviderId;
  displayName: string;
  capabilities: SmartAccountProviderCapabilities;
};

export type ProvisioningStatus = "pending" | "ready" | "failed";

export type ProvisioningResult = {
  status: ProvisioningStatus;
  address?: string;
  chainId: string;
  provider: string;
  error?: string;
};

export type SmartAccountLinkage = {
  userSub: string;
  chainId: string;
  provider: string;
  smartAccountAddress?: string;
  provisioningStatus: ProvisioningStatus;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
};

export type CallInput = {
  to: Address;
  value?: bigint;
  data?: Hex;
};

export type EncodedCallInput = {
  to: Address;
  value?: bigint;
  abi: Abi;
  functionName: string;
  args?: unknown[];
};

export type UserOpResult = {
  userOpHash: Hex;
};

export type UserOpReceipt = {
  userOpHash: Hex;
  success: boolean;
  transactionHash?: Hex;
};

/**
 * Smart Account Provider Adapter Interface
 *
 * Defines the contract for smart account providers.
 */
export interface ISmartAccountProviderAdapter {
  readonly id: SmartAccountProviderId;
  readonly metadata: SmartAccountProviderMetadata;

  /**
   * Check if this provider is enabled via configuration.
   */
  isEnabled(): boolean;

  /**
   * Get the chain ID this provider is configured for.
   */
  getChainId(): string;

  /**
   * Ensure a smart account exists for the user.
   * Creates one if needed (idempotent).
   */
  ensureSmartAccountForUser(userSub: string): Promise<ProvisioningResult>;

  /**
   * Get existing smart account linkage for a user.
   */
  getSmartAccountForUser(userSub: string): Promise<SmartAccountLinkage | null>;

  /**
   * Build and submit a UserOp for raw call inputs.
   */
  buildAndSubmitUserOp(userSub: string, calls: CallInput[]): Promise<UserOpResult>;

  /**
   * Build and submit a UserOp with ABI-encoded calls.
   */
  buildAndSubmitEncodedUserOp(userSub: string, calls: EncodedCallInput[]): Promise<UserOpResult>;

  /**
   * Wait for a UserOp receipt.
   */
  waitForUserOpReceipt(userSub: string, userOpHash: Hex, timeoutMs?: number): Promise<UserOpReceipt>;

  /**
   * Submit UserOp and wait for receipt in one call.
   */
  submitUserOpAndWait(userSub: string, calls: CallInput[], timeoutMs?: number): Promise<UserOpReceipt>;
}
