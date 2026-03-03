/**
 * Privy Smart Account Provider Adapter
 *
 * Client-side adapter for Privy wallets + Rhinestone SDK integration.
 * Privy creates/manages the user wallet client-side at login time.
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
import { activeNetwork } from "@/lib/constants/networks";

export class PrivySmartAccountAdapter
  implements ISmartAccountProviderAdapter
{
  readonly id: SmartAccountProviderId = "privy";

  readonly metadata: SmartAccountProviderMetadata = {
    id: "privy",
    displayName: "Privy + Rhinestone",
    capabilities: {
      serverProvisioning: false,
      userOpSubmission: true,
      externalWallet: false,
    },
  };

  isEnabled(): boolean {
    return !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  }

  getChainId(): string {
    // Keep Privy client-side chain independent from SMART_ACCOUNT_CHAIN_ID
    // to avoid accidental mainnet (1) fallback from legacy server settings.
    return process.env.NEXT_PUBLIC_PRIVY_CHAIN_ID || String(activeNetwork.chainId);
  }

  async ensureSmartAccountForUser(userSub: string): Promise<ProvisioningResult> {
    void userSub;
    return {
      status: "ready",
      chainId: this.getChainId(),
      provider: this.id,
      error:
        "Privy wallets are provisioned client-side during login. No server provisioning needed.",
    };
  }

  async getSmartAccountForUser(userSub: string): Promise<SmartAccountLinkage | null> {
    void userSub;
    return null;
  }

  async buildAndSubmitUserOp(userSub: string, calls: CallInput[]): Promise<UserOpResult> {
    void userSub;
    void calls;
    throw new Error(
      "Privy UserOp submission is handled client-side via the Privy wallet stack. " +
        "Use wagmi hooks (useSendTransaction, useWriteContract) in the browser.",
    );
  }

  async buildAndSubmitEncodedUserOp(
    userSub: string,
    calls: EncodedCallInput[],
  ): Promise<UserOpResult> {
    void userSub;
    void calls;
    throw new Error(
      "Privy encoded UserOp submission is handled client-side via the Privy wallet stack. " +
        "Use wagmi hooks (useWriteContract) in the browser.",
    );
  }

  async waitForUserOpReceipt(
    userSub: string,
    userOpHash: Hex,
    timeoutMs?: number,
  ): Promise<UserOpReceipt> {
    void userSub;
    void userOpHash;
    void timeoutMs;
    throw new Error(
      "Privy receipt waiting is handled client-side. " +
        "Use wagmi hooks (useWaitForTransactionReceipt) in the browser.",
    );
  }

  async submitUserOpAndWait(
    userSub: string,
    calls: CallInput[],
    timeoutMs?: number,
  ): Promise<UserOpReceipt> {
    void userSub;
    void calls;
    void timeoutMs;
    throw new Error(
      "Privy transaction submission is handled client-side. " +
        "Use wagmi hooks in the browser.",
    );
  }
}

export const privySmartAccountAdapter = new PrivySmartAccountAdapter();
