/**
 * WalletConnect Smart Account Provider Adapter (Placeholder)
 *
 * This is a placeholder adapter for future WalletConnect integration.
 * The adapter is registered but not enabled by default.
 *
 * WalletConnect smart account provider would use the connected external wallet
 * as the signer for smart account operations.
 */

import type { Hex } from "viem";
import type {
  SmartAccountProviderId,
  SmartAccountProviderMetadata,
  ISmartAccountProviderAdapter,
  ProvisioningResult,
  SmartAccountLinkage,
  CallInput,
  EncodedCallInput,
  UserOpResult,
  UserOpReceipt,
} from "../types";

export class WalletConnectSmartAccountAdapter implements ISmartAccountProviderAdapter {
  readonly id: SmartAccountProviderId = "walletconnect";

  readonly metadata: SmartAccountProviderMetadata = {
    id: "walletconnect",
    displayName: "WalletConnect",
    capabilities: {
      serverProvisioning: false,
      userOpSubmission: true,
      externalWallet: true,
    },
  };

  isEnabled(): boolean {
    return false;
  }

  getChainId(): string {
    return process.env.SMART_ACCOUNT_CHAIN_ID || "1";
  }

  async ensureSmartAccountForUser(_userSub: string): Promise<ProvisioningResult> {
    return {
      status: "pending",
      chainId: this.getChainId(),
      provider: this.id,
      error: "WalletConnect smart account provisioning is not yet implemented",
    };
  }

  async getSmartAccountForUser(_userSub: string): Promise<SmartAccountLinkage | null> {
    return null;
  }

  async buildAndSubmitUserOp(_userSub: string, _calls: CallInput[]): Promise<UserOpResult> {
    throw new Error("WalletConnect UserOp submission is not yet implemented");
  }

  async buildAndSubmitEncodedUserOp(_userSub: string, _calls: EncodedCallInput[]): Promise<UserOpResult> {
    throw new Error("WalletConnect UserOp submission is not yet implemented");
  }

  async waitForUserOpReceipt(
    _userSub: string,
    _userOpHash: Hex,
    _timeoutMs?: number,
  ): Promise<UserOpReceipt> {
    throw new Error("WalletConnect UserOp receipt waiting is not yet implemented");
  }

  async submitUserOpAndWait(
    _userSub: string,
    _calls: CallInput[],
    _timeoutMs?: number,
  ): Promise<UserOpReceipt> {
    throw new Error("WalletConnect UserOp submission is not yet implemented");
  }
}

export const walletconnectSmartAccountAdapter = new WalletConnectSmartAccountAdapter();
