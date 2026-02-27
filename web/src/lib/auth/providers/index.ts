export type {
  AuthProviderId,
  AuthProviderCapabilities,
  AuthProviderMetadata,
  LoginContext,
  ServerLoginResult,
  ClientLoginConfig,
  LoginInitResult,
  AuthStatus,
  UnifiedWalletInfo,
  IAuthProviderAdapter,
  IClientAuthAdapter,
} from "./types";

export {
  registerAuthProvider,
  getAuthProviderAdapter,
  getAllAuthProviders,
  getAuthProviderIds,
  getConfiguredAuthProviderId,
  getActiveAuthProvider,
  AuthFacade,
} from "./registry";

export {
  GoogleOidcAuthAdapter,
  googleOidcAdapter,
  ZeroDevSocialAuthAdapter,
  zerodevSocialAdapter,
  type ZeroDevSocialConfig,
  type ZeroDevSocialProvider,
  WalletConnectAuthAdapter,
  walletconnectAuthAdapter,
  type WalletConnectAuthConfig,
  ReownAppKitAuthAdapter,
  reownAppKitAuthAdapter,
  type ReownAppKitAuthConfig,
} from "./adapters";

export { initializeAuthProviders } from "./setup";
