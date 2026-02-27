/**
 * Auth Provider Setup
 *
 * Registers all available auth provider adapters.
 * Import this module to ensure adapters are registered before use.
 */

import { registerAuthProvider } from "./registry";
import { googleOidcAdapter } from "./adapters/google-oidc";
import { zerodevSocialAdapter } from "./adapters/zerodev-social";
import { walletconnectAuthAdapter } from "./adapters/walletconnect";
import { reownAppKitAuthAdapter } from "./adapters/reown-appkit";

let initialized = false;

export function initializeAuthProviders(): void {
  if (initialized) {
    return;
  }

  registerAuthProvider(googleOidcAdapter);
  registerAuthProvider(zerodevSocialAdapter);
  registerAuthProvider(walletconnectAuthAdapter);
  registerAuthProvider(reownAppKitAuthAdapter);

  initialized = true;
}

initializeAuthProviders();
