/**
 * Auth Provider Registry
 *
 * Central registry for auth provider adapters.
 * Resolves the active provider from configuration and exposes a unified facade.
 */

import type {
  AuthProviderId,
  AuthProviderMetadata,
  IAuthProviderAdapter,
  LoginContext,
  LoginInitResult,
} from "./types";

const adapters = new Map<AuthProviderId, IAuthProviderAdapter>();

export function registerAuthProvider(adapter: IAuthProviderAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getAuthProviderAdapter(id: AuthProviderId): IAuthProviderAdapter | undefined {
  return adapters.get(id);
}

export function getAllAuthProviders(): IAuthProviderAdapter[] {
  return Array.from(adapters.values());
}

export function getAuthProviderIds(): AuthProviderId[] {
  return Array.from(adapters.keys());
}

const DEFAULT_AUTH_PROVIDER: AuthProviderId = "google_oidc";

function normalizeProviderId(raw: string | undefined): AuthProviderId {
  if (raw === "zerodev_social" || raw === "walletconnect" || raw === "reown_appkit") {
    return raw;
  }
  return DEFAULT_AUTH_PROVIDER;
}

export function getConfiguredAuthProviderId(): AuthProviderId {
  return normalizeProviderId(process.env.AUTH_PROVIDER);
}

export function getActiveAuthProvider(): IAuthProviderAdapter {
  const id = getConfiguredAuthProviderId();
  const adapter = adapters.get(id);
  if (!adapter) {
    throw new Error(`Auth provider "${id}" is not registered. Available: ${getAuthProviderIds().join(", ")}`);
  }
  return adapter;
}

/**
 * Auth Facade
 *
 * Unified interface for auth operations that delegates to the active provider.
 */
export const AuthFacade = {
  getActiveProviderId(): AuthProviderId {
    return getConfiguredAuthProviderId();
  },

  getActiveProviderMetadata(): AuthProviderMetadata {
    return getActiveAuthProvider().metadata;
  },

  getLinkedSmartAccountProvider(): string | undefined {
    return getActiveAuthProvider().linkedSmartAccountProvider;
  },

  async initiateLogin(context: LoginContext): Promise<LoginInitResult> {
    const provider = getActiveAuthProvider();
    return provider.initiateLogin(context);
  },

  supportsServerLogout(): boolean {
    const provider = getActiveAuthProvider();
    return provider.supportsServerLogout();
  },

  getProviderMetadata(id: AuthProviderId): AuthProviderMetadata | undefined {
    return adapters.get(id)?.metadata;
  },

  isProviderRegistered(id: AuthProviderId): boolean {
    return adapters.has(id);
  },
};
