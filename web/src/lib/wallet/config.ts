import { http, type Chain, type Transport } from "viem";
import { mainnet } from "viem/chains";

export type WalletConfig = {
  chainId: string;
  chain: Chain;
  rpcUrl: string;
  rpcTransport: Transport;
  bundlerRpcUrl: string;
  bundlerTransport: Transport;
  ownerPrivateKey: `0x${string}`;
  provider: "zerodev";
  enabled: boolean;
};

let cachedConfig: WalletConfig | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getTenderlyVirtualnetChain(chainId: number, rpcUrl: string): Chain {
  return {
    id: chainId,
    name: "Tenderly Virtualnet",
    nativeCurrency: mainnet.nativeCurrency,
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
  };
}

export function isSmartAccountProvisioningEnabled(): boolean {
  return process.env.ENABLE_SMART_ACCOUNT_PROVISIONING === "true";
}

export function getWalletConfig(): WalletConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const enabled = isSmartAccountProvisioningEnabled();
  if (!enabled) {
    throw new Error("Smart account provisioning is disabled. Set ENABLE_SMART_ACCOUNT_PROVISIONING=true to enable.");
  }

  const rpcUrl = getRequiredEnv("SMART_ACCOUNT_RPC_URL");
  const chainIdStr = process.env.SMART_ACCOUNT_CHAIN_ID || "1";
  const chainId = parseInt(chainIdStr, 10);

  if (isNaN(chainId)) {
    throw new Error(`Invalid SMART_ACCOUNT_CHAIN_ID: ${chainIdStr}`);
  }

  const ownerPrivateKey = getRequiredEnv("SMART_ACCOUNT_OWNER_PRIVATE_KEY");
  if (!ownerPrivateKey.startsWith("0x")) {
    throw new Error("SMART_ACCOUNT_OWNER_PRIVATE_KEY must start with 0x");
  }

  const bundlerRpcUrl = process.env.ZERODEV_RPC_URL || rpcUrl;

  const chain = getTenderlyVirtualnetChain(chainId, rpcUrl);

  cachedConfig = {
    chainId: chainIdStr,
    chain,
    rpcUrl,
    rpcTransport: http(rpcUrl),
    bundlerRpcUrl,
    bundlerTransport: http(bundlerRpcUrl),
    ownerPrivateKey: ownerPrivateKey as `0x${string}`,
    provider: "zerodev",
    enabled,
  };

  return cachedConfig;
}

export function clearWalletConfigCache(): void {
  cachedConfig = null;
}
