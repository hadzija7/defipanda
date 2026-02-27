/**
 * Google OIDC Auth Provider Adapter
 *
 * Server-side adapter for Google OAuth with OIDC Authorization Code + PKCE flow.
 */

import type {
  AuthProviderId,
  AuthProviderMetadata,
  IAuthProviderAdapter,
  LoginContext,
  LoginInitResult,
} from "../types";

export class GoogleOidcAuthAdapter implements IAuthProviderAdapter {
  readonly id: AuthProviderId = "google_oidc";

  readonly metadata: AuthProviderMetadata = {
    id: "google_oidc",
    displayName: "Google OAuth",
    capabilities: {
      serverSession: true,
      clientSideLogin: false,
      smartAccountProvisioning: true,
      unifiedWalletAuth: false,
    },
  };

  async initiateLogin(context: LoginContext): Promise<LoginInitResult> {
    const returnToParam = context.returnTo ? `?returnTo=${encodeURIComponent(context.returnTo)}` : "";
    return {
      type: "redirect",
      url: `/auth/google/login${returnToParam}`,
    };
  }

  supportsServerLogout(): boolean {
    return true;
  }
}

export const googleOidcAdapter = new GoogleOidcAuthAdapter();
