/**
 * Privy Auth Provider Adapter
 *
 * Client-side adapter for Privy login + embedded wallet connection.
 * Privy handles both authentication and wallet creation in one browser flow.
 */

import type {
  AuthProviderId,
  AuthProviderMetadata,
  IClientAuthAdapter,
  LoginContext,
  LoginInitResult,
} from "../types";
import { activeNetwork } from "@/lib/constants/networks";

export type PrivyAuthConfig = {
  appId: string;
  chainId: number;
  rpcUrl?: string;
  returnTo?: string;
};

export class PrivyAuthAdapter implements IClientAuthAdapter {
  readonly id: AuthProviderId = "privy";

  readonly linkedSmartAccountProvider = "privy";

  readonly metadata: AuthProviderMetadata = {
    id: "privy",
    displayName: "Privy",
    capabilities: {
      serverSession: false,
      clientSideLogin: true,
      smartAccountProvisioning: false,
      unifiedWalletAuth: true,
    },
  };

  private getChainId(): number {
    // Privy client-side chain selection must not inherit SMART_ACCOUNT_CHAIN_ID,
    // which is often set to 1 for older server-side provisioning flows.
    const chainIdStr =
      process.env.NEXT_PUBLIC_PRIVY_CHAIN_ID || String(activeNetwork.chainId);
    const parsed = parseInt(chainIdStr, 10);
    return Number.isNaN(parsed) ? activeNetwork.chainId : parsed;
  }

  async initiateLogin(context: LoginContext): Promise<LoginInitResult> {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    if (!appId) {
      throw new Error(
        "NEXT_PUBLIC_PRIVY_APP_ID is required for Privy login",
      );
    }

    return {
      type: "client",
      provider: this.id,
      config: {
        appId,
        chainId: this.getChainId(),
        rpcUrl: process.env.NEXT_PUBLIC_PRIVY_RPC_URL,
        returnTo: context.returnTo,
      } satisfies PrivyAuthConfig,
    };
  }

  supportsServerLogout(): boolean {
    return false;
  }

  getClientConfig(): PrivyAuthConfig {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    if (!appId) {
      throw new Error(
        "NEXT_PUBLIC_PRIVY_APP_ID is required for Privy login",
      );
    }

    return {
      appId,
      chainId: this.getChainId(),
      rpcUrl: process.env.NEXT_PUBLIC_PRIVY_RPC_URL,
    };
  }
}

export const privyAuthAdapter = new PrivyAuthAdapter();
