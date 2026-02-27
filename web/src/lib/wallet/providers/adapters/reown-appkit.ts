/**
 * Reown AppKit Smart Account Provider Adapter
 *
 * Client-side adapter for Reown AppKit embedded wallets + Rhinestone SDK.
 * AppKit creates non-custodial wallets for social/email login users automatically.
 *
 * Transaction execution:
 * - Client-side: Rhinestone SDK wraps the AppKit walletClient for cross-chain
 *   transactions and portfolio management via `useRhinestoneAccount` hook.
 * - Backend (DCA): Rhinestone session keys allow the server to execute scoped
 *   transactions (e.g. DCA swaps) without further user interaction.
 *   See `web/src/lib/wallet/rhinestone-sessions.ts` and `/api/dca/execute`.
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

export class ReownAppKitSmartAccountAdapter implements ISmartAccountProviderAdapter {
  readonly id: SmartAccountProviderId = "reown_appkit";

  readonly metadata: SmartAccountProviderMetadata = {
    id: "reown_appkit",
    displayName: "Reown AppKit + Rhinestone",
    capabilities: {
      serverProvisioning: false,
      userOpSubmission: true,
      externalWallet: false,
    },
  };

  isEnabled(): boolean {
    return !!process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  }

  getChainId(): string {
    return process.env.NEXT_PUBLIC_APPKIT_CHAIN_ID || process.env.SMART_ACCOUNT_CHAIN_ID || "1";
  }

  async ensureSmartAccountForUser(_userSub: string): Promise<ProvisioningResult> {
    return {
      status: "ready",
      chainId: this.getChainId(),
      provider: this.id,
      error: "Reown AppKit wallets are provisioned client-side during social login. No server provisioning needed.",
    };
  }

  async getSmartAccountForUser(_userSub: string): Promise<SmartAccountLinkage | null> {
    return null;
  }

  async buildAndSubmitUserOp(_userSub: string, _calls: CallInput[]): Promise<UserOpResult> {
    throw new Error(
      "Reown AppKit UserOp submission is handled client-side via the AppKit SDK. " +
      "Use wagmi hooks (useSendTransaction, useWriteContract) in the browser.",
    );
  }

  async buildAndSubmitEncodedUserOp(_userSub: string, _calls: EncodedCallInput[]): Promise<UserOpResult> {
    throw new Error(
      "Reown AppKit encoded UserOp submission is handled client-side via the AppKit SDK. " +
      "Use wagmi hooks (useWriteContract) in the browser.",
    );
  }

  async waitForUserOpReceipt(
    _userSub: string,
    _userOpHash: Hex,
    _timeoutMs?: number,
  ): Promise<UserOpReceipt> {
    throw new Error(
      "Reown AppKit receipt waiting is handled client-side. " +
      "Use wagmi hooks (useWaitForTransactionReceipt) in the browser.",
    );
  }

  async submitUserOpAndWait(
    _userSub: string,
    _calls: CallInput[],
    _timeoutMs?: number,
  ): Promise<UserOpReceipt> {
    throw new Error(
      "Reown AppKit transaction submission is handled client-side. " +
      "Use wagmi hooks in the browser.",
    );
  }
}

export const reownAppKitSmartAccountAdapter = new ReownAppKitSmartAccountAdapter();
