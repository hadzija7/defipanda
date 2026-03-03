/**
 * Smart Account Provider Setup
 *
 * Registers all available smart account provider adapters.
 * Import this module to ensure adapters are registered before use.
 */

import { registerSmartAccountProvider } from "./registry";
import { zerodevSmartAccountAdapter } from "./adapters/zerodev";
import { walletconnectSmartAccountAdapter } from "./adapters/walletconnect";
import { reownAppKitSmartAccountAdapter } from "./adapters/reown-appkit";
import { privySmartAccountAdapter } from "./adapters/privy";

let initialized = false;

export function initializeSmartAccountProviders(): void {
  if (initialized) {
    return;
  }

  registerSmartAccountProvider(zerodevSmartAccountAdapter);
  registerSmartAccountProvider(walletconnectSmartAccountAdapter);
  registerSmartAccountProvider(reownAppKitSmartAccountAdapter);
  registerSmartAccountProvider(privySmartAccountAdapter);

  initialized = true;
}

initializeSmartAccountProviders();
