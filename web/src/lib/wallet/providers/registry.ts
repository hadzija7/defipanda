/**
 * Smart Account Provider Registry
 *
 * Central registry for smart account provider adapters.
 * Resolves the active provider from configuration and exposes a unified facade.
 */

import type { Hex } from "viem";
import type {
  SmartAccountProviderId,
  SmartAccountProviderMetadata,
  ISmartAccountProviderAdapter,
  ProvisioningResult,
  SmartAccountLinkage,
  CallInput,
  EncodedCallInput,
  UserOpResult,
  UserOpReceipt,
} from "./types";

const adapters = new Map<SmartAccountProviderId, ISmartAccountProviderAdapter>();

export function registerSmartAccountProvider(adapter: ISmartAccountProviderAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getSmartAccountProviderAdapter(id: SmartAccountProviderId): ISmartAccountProviderAdapter | undefined {
  return adapters.get(id);
}

export function getAllSmartAccountProviders(): ISmartAccountProviderAdapter[] {
  return Array.from(adapters.values());
}

export function getSmartAccountProviderIds(): SmartAccountProviderId[] {
  return Array.from(adapters.keys());
}

const DEFAULT_SMART_ACCOUNT_PROVIDER: SmartAccountProviderId = "zerodev";

function normalizeProviderId(raw: string | undefined): SmartAccountProviderId {
  if (raw === "walletconnect" || raw === "reown_appkit") {
    return raw;
  }
  return DEFAULT_SMART_ACCOUNT_PROVIDER;
}

export function getConfiguredSmartAccountProviderId(): SmartAccountProviderId {
  return normalizeProviderId(process.env.SMART_ACCOUNT_PROVIDER);
}

export function getActiveSmartAccountProvider(): ISmartAccountProviderAdapter {
  const id = getConfiguredSmartAccountProviderId();
  const adapter = adapters.get(id);
  if (!adapter) {
    throw new Error(`Smart account provider "${id}" is not registered. Available: ${getSmartAccountProviderIds().join(", ")}`);
  }
  return adapter;
}

/**
 * Smart Account Facade
 *
 * Unified interface for smart account operations that delegates to the active provider.
 */
export const SmartAccountFacade = {
  getActiveProviderId(): SmartAccountProviderId {
    return getConfiguredSmartAccountProviderId();
  },

  getActiveProviderMetadata(): SmartAccountProviderMetadata {
    return getActiveSmartAccountProvider().metadata;
  },

  isEnabled(): boolean {
    try {
      const provider = getActiveSmartAccountProvider();
      return provider.isEnabled();
    } catch {
      return false;
    }
  },

  getChainId(): string {
    return getActiveSmartAccountProvider().getChainId();
  },

  async ensureSmartAccountForUser(userSub: string): Promise<ProvisioningResult> {
    const provider = getActiveSmartAccountProvider();
    return provider.ensureSmartAccountForUser(userSub);
  },

  async getSmartAccountForUser(userSub: string): Promise<SmartAccountLinkage | null> {
    const provider = getActiveSmartAccountProvider();
    return provider.getSmartAccountForUser(userSub);
  },

  async buildAndSubmitUserOp(userSub: string, calls: CallInput[]): Promise<UserOpResult> {
    const provider = getActiveSmartAccountProvider();
    return provider.buildAndSubmitUserOp(userSub, calls);
  },

  async buildAndSubmitEncodedUserOp(userSub: string, calls: EncodedCallInput[]): Promise<UserOpResult> {
    const provider = getActiveSmartAccountProvider();
    return provider.buildAndSubmitEncodedUserOp(userSub, calls);
  },

  async waitForUserOpReceipt(userSub: string, userOpHash: Hex, timeoutMs?: number): Promise<UserOpReceipt> {
    const provider = getActiveSmartAccountProvider();
    return provider.waitForUserOpReceipt(userSub, userOpHash, timeoutMs);
  },

  async submitUserOpAndWait(userSub: string, calls: CallInput[], timeoutMs?: number): Promise<UserOpReceipt> {
    const provider = getActiveSmartAccountProvider();
    return provider.submitUserOpAndWait(userSub, calls, timeoutMs);
  },

  getProviderMetadata(id: SmartAccountProviderId): SmartAccountProviderMetadata | undefined {
    return adapters.get(id)?.metadata;
  },

  isProviderRegistered(id: SmartAccountProviderId): boolean {
    return adapters.has(id);
  },
};
