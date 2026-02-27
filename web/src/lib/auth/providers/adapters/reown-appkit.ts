/**
 * Reown AppKit Auth Provider Adapter
 *
 * Client-side adapter for Reown AppKit social login + wallet connection.
 * AppKit handles both social authentication AND smart account creation
 * in a unified client-side flow via the <appkit-button> web component.
 *
 * Supports: Google, X, GitHub, Discord, Apple, Facebook, Farcaster,
 * email OTP, and all WalletConnect-compatible wallets.
 */

import type {
  AuthProviderId,
  AuthProviderMetadata,
  IClientAuthAdapter,
  LoginContext,
  LoginInitResult,
} from "../types";

export type ReownAppKitAuthConfig = {
  projectId: string;
  chainId: number;
};

export class ReownAppKitAuthAdapter implements IClientAuthAdapter {
  readonly id: AuthProviderId = "reown_appkit";

  /**
   * Reown AppKit manages its own smart account infrastructure
   * via the embedded wallet created during social login.
   */
  readonly linkedSmartAccountProvider = "reown_appkit";

  readonly metadata: AuthProviderMetadata = {
    id: "reown_appkit",
    displayName: "Reown AppKit",
    capabilities: {
      serverSession: false,
      clientSideLogin: true,
      smartAccountProvisioning: false,
      unifiedWalletAuth: true,
    },
  };

  private getChainId(): number {
    const chainIdStr = process.env.NEXT_PUBLIC_APPKIT_CHAIN_ID || process.env.SMART_ACCOUNT_CHAIN_ID || "1";
    return parseInt(chainIdStr, 10);
  }

  async initiateLogin(context: LoginContext): Promise<LoginInitResult> {
    const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is required for Reown AppKit login");
    }

    return {
      type: "client",
      provider: this.id,
      config: {
        projectId,
        chainId: this.getChainId(),
        returnTo: context.returnTo,
      },
    };
  }

  supportsServerLogout(): boolean {
    return false;
  }

  getClientConfig(): ReownAppKitAuthConfig {
    const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_REOWN_PROJECT_ID is required for Reown AppKit login");
    }

    return {
      projectId,
      chainId: this.getChainId(),
    };
  }
}

export const reownAppKitAuthAdapter = new ReownAppKitAuthAdapter();
