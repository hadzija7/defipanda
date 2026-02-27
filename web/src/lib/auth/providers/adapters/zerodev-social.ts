/**
 * ZeroDev Social Auth Provider Adapter
 *
 * Client-side adapter for ZeroDev social login.
 * Login is initiated via client-side SDK, not server redirect.
 *
 * This provider has unified auth+wallet capability: the ZeroDev SDK
 * handles both social authentication AND smart account creation in one flow.
 */

import type {
  AuthProviderId,
  AuthProviderMetadata,
  IClientAuthAdapter,
  LoginContext,
  LoginInitResult,
} from "../types";

export type ZeroDevSocialProvider = "google" | "facebook";

export type ZeroDevSocialConfig = {
  projectId: string;
  socialProvider: ZeroDevSocialProvider;
  oauthCallbackUrl: string;
  chainId: number;
};

export class ZeroDevSocialAuthAdapter implements IClientAuthAdapter {
  readonly id: AuthProviderId = "zerodev_social";

  /**
   * ZeroDev social auth creates a ZeroDev smart account.
   */
  readonly linkedSmartAccountProvider = "zerodev";

  readonly metadata: AuthProviderMetadata = {
    id: "zerodev_social",
    displayName: "ZeroDev Social Login",
    capabilities: {
      serverSession: false,
      clientSideLogin: true,
      smartAccountProvisioning: false,
      unifiedWalletAuth: true,
    },
  };

  private getChainId(): number {
    const chainIdStr = process.env.NEXT_PUBLIC_ZERODEV_CHAIN_ID || process.env.SMART_ACCOUNT_CHAIN_ID || "1";
    return parseInt(chainIdStr, 10);
  }

  async initiateLogin(context: LoginContext): Promise<LoginInitResult> {
    const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
    const socialProvider = (process.env.NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER as ZeroDevSocialProvider) || "google";

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_ZERODEV_PROJECT_ID is required for ZeroDev social login");
    }

    return {
      type: "client",
      provider: this.id,
      config: {
        projectId,
        socialProvider,
        oauthCallbackUrl: `${context.origin}/`,
        chainId: this.getChainId(),
      } satisfies ZeroDevSocialConfig,
    };
  }

  supportsServerLogout(): boolean {
    return false;
  }

  getClientConfig(): ZeroDevSocialConfig {
    const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
    const socialProvider = (process.env.NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER as ZeroDevSocialProvider) || "google";

    if (!projectId) {
      throw new Error("NEXT_PUBLIC_ZERODEV_PROJECT_ID is required for ZeroDev social login");
    }

    return {
      projectId,
      socialProvider,
      oauthCallbackUrl: "",
      chainId: this.getChainId(),
    };
  }
}

export const zerodevSocialAdapter = new ZeroDevSocialAuthAdapter();
