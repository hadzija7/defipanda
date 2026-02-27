/**
 * WalletConnect Auth Provider Adapter (Placeholder)
 *
 * This is a placeholder adapter for future WalletConnect integration.
 * The adapter is registered but not enabled by default.
 *
 * WalletConnect auth would connect an external wallet and derive identity
 * from the connected wallet address. This provider has unified auth+wallet
 * capability: the connected wallet IS the smart account.
 */

import type {
  AuthProviderId,
  AuthProviderMetadata,
  IClientAuthAdapter,
  LoginContext,
  LoginInitResult,
} from "../types";

export type WalletConnectAuthConfig = {
  projectId: string;
  chainId: number;
};

export class WalletConnectAuthAdapter implements IClientAuthAdapter {
  readonly id: AuthProviderId = "walletconnect";

  /**
   * WalletConnect auth uses its own smart account infrastructure.
   */
  readonly linkedSmartAccountProvider = "walletconnect";

  readonly metadata: AuthProviderMetadata = {
    id: "walletconnect",
    displayName: "WalletConnect",
    capabilities: {
      serverSession: false,
      clientSideLogin: true,
      smartAccountProvisioning: false,
      unifiedWalletAuth: true,
    },
  };

  private getChainId(): number {
    const chainIdStr = process.env.NEXT_PUBLIC_WALLETCONNECT_CHAIN_ID || process.env.SMART_ACCOUNT_CHAIN_ID || "1";
    return parseInt(chainIdStr, 10);
  }

  async initiateLogin(context: LoginContext): Promise<LoginInitResult> {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required for WalletConnect login");
    }

    return {
      type: "client",
      provider: this.id,
      config: {
        projectId,
        chainId: this.getChainId(),
        returnTo: context.returnTo,
      } satisfies WalletConnectAuthConfig & { returnTo?: string },
    };
  }

  supportsServerLogout(): boolean {
    return false;
  }

  getClientConfig(): WalletConnectAuthConfig {
    const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required for WalletConnect login");
    }

    return {
      projectId,
      chainId: this.getChainId(),
    };
  }
}

export const walletconnectAuthAdapter = new WalletConnectAuthAdapter();
