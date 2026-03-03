/**
 * Auth Provider Types
 *
 * Defines the contracts for authentication providers.
 * Each provider can have different capabilities (server-side vs client-side).
 */

export type AuthProviderId =
  | "google_oidc"
  | "zerodev_social"
  | "walletconnect"
  | "reown_appkit"
  | "privy";

export type AuthProviderCapabilities = {
  /** Provider can issue server-side sessions */
  serverSession: boolean;
  /** Provider requires client-side SDK for login initiation */
  clientSideLogin: boolean;
  /** Provider supports server-side smart account provisioning after auth */
  smartAccountProvisioning: boolean;
  /** Provider SDK handles both auth AND wallet in a unified client-side flow */
  unifiedWalletAuth: boolean;
};

export type AuthProviderMetadata = {
  id: AuthProviderId;
  displayName: string;
  capabilities: AuthProviderCapabilities;
};

export type LoginContext = {
  returnTo?: string;
  origin: string;
};

export type ServerLoginResult = {
  type: "redirect";
  url: string;
};

export type ClientLoginConfig = {
  type: "client";
  provider: AuthProviderId;
  config: Record<string, unknown>;
};

export type LoginInitResult = ServerLoginResult | ClientLoginConfig;

export type AuthStatus = {
  authenticated: boolean;
  provider: AuthProviderId | null;
};

/**
 * Unified wallet info returned from client-side auth providers
 * that create smart accounts as part of the login flow.
 */
export type UnifiedWalletInfo = {
  address: string;
  chainId: number;
};

/**
 * Auth Provider Adapter Interface
 *
 * Server-side adapters handle server-capable flows (redirects, callbacks).
 * Client-side adapters expose configuration for browser SDK orchestration.
 */
export interface IAuthProviderAdapter {
  readonly id: AuthProviderId;
  readonly metadata: AuthProviderMetadata;

  /**
   * For unified auth+wallet providers, the linked smart account provider ID.
   * This allows the system to know which wallet provider to use for operations.
   */
  readonly linkedSmartAccountProvider?: string;

  /**
   * Initiate login flow.
   * For server providers: returns redirect URL.
   * For client providers: returns config for client-side SDK.
   */
  initiateLogin(context: LoginContext): Promise<LoginInitResult>;

  /**
   * Check if this adapter can handle server-side logout.
   * Some providers only have client-side logout.
   */
  supportsServerLogout(): boolean;
}

/**
 * Client Auth Adapter Interface
 *
 * Extended interface for providers that require client-side orchestration.
 */
export interface IClientAuthAdapter extends IAuthProviderAdapter {
  /**
   * Get client-side configuration needed to initialize the provider SDK.
   */
  getClientConfig(): Record<string, unknown>;

  /**
   * Check authorization status using provider SDK.
   * This is called client-side.
   */
  checkAuthorization?(): Promise<boolean>;
}
