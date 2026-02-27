import { createPublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount } from "@zerodev/sdk";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

import {
  getSmartAccountLinkage,
  upsertSmartAccountLinkagePending,
  updateSmartAccountLinkageReady,
  updateSmartAccountLinkageFailed,
  type SmartAccountLinkage,
  type ProvisioningStatus,
} from "@/lib/auth/store";
import { getWalletConfig, isSmartAccountProvisioningEnabled } from "./config";

export type ProvisioningResult = {
  status: ProvisioningStatus;
  address?: string;
  chainId: string;
  provider: string;
  error?: string;
};

export async function ensureSmartAccountForUser(userSub: string): Promise<ProvisioningResult> {
  if (!isSmartAccountProvisioningEnabled()) {
    return {
      status: "pending",
      chainId: process.env.SMART_ACCOUNT_CHAIN_ID || "1",
      provider: "zerodev",
      error: "Smart account provisioning is disabled",
    };
  }

  const config = getWalletConfig();
  const { chainId, provider } = config;

  const existingLinkage = await getSmartAccountLinkage(userSub, chainId, provider);
  if (existingLinkage?.provisioningStatus === "ready" && existingLinkage.smartAccountAddress) {
    return {
      status: "ready",
      address: existingLinkage.smartAccountAddress,
      chainId,
      provider,
    };
  }

  await upsertSmartAccountLinkagePending(userSub, chainId, provider);

  try {
    const address = await createDeterministicSmartAccount(userSub, config);

    const linkage = await updateSmartAccountLinkageReady(userSub, chainId, provider, address);

    return {
      status: linkage.provisioningStatus,
      address: linkage.smartAccountAddress,
      chainId,
      provider,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const linkage = await updateSmartAccountLinkageFailed(userSub, chainId, provider, errorMessage);

    return {
      status: linkage.provisioningStatus,
      chainId,
      provider,
      error: linkage.lastError,
    };
  }
}

async function createDeterministicSmartAccount(
  userSub: string,
  config: ReturnType<typeof getWalletConfig>,
): Promise<string> {
  const { chain, rpcTransport, ownerPrivateKey } = config;

  const publicClient = createPublicClient({
    chain,
    transport: rpcTransport,
  });

  const ownerSigner = privateKeyToAccount(ownerPrivateKey);

  const entryPoint = getEntryPoint("0.7");
  const kernelVersion = KERNEL_V3_1;

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner,
    entryPoint,
    kernelVersion,
  });

  const deterministicIndex = hashUserSubToIndex(userSub);

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
    index: deterministicIndex,
  });

  return account.address;
}

function hashUserSubToIndex(userSub: string): bigint {
  let hash = BigInt(0);
  const shift = BigInt(5);
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < userSub.length; i++) {
    const char = BigInt(userSub.charCodeAt(i));
    hash = ((hash << shift) - hash + char) & mask;
  }
  return hash;
}

export async function getSmartAccountForUser(userSub: string): Promise<SmartAccountLinkage | null> {
  if (!isSmartAccountProvisioningEnabled()) {
    return null;
  }

  const config = getWalletConfig();
  return getSmartAccountLinkage(userSub, config.chainId, config.provider);
}
