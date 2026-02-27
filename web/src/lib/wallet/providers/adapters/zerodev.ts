/**
 * ZeroDev Smart Account Provider Adapter
 *
 * Server-side adapter for ZeroDev Kernel smart accounts.
 * Wraps existing provisioning and UserOp execution logic.
 */

import type { Hex } from "viem";
import { createPublicClient, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

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
} from "../types";

import {
  getSmartAccountLinkage,
  upsertSmartAccountLinkagePending,
  updateSmartAccountLinkageReady,
  updateSmartAccountLinkageFailed,
} from "@/lib/auth/store";
import {
  isSmartAccountProvisioningEnabled,
  getWalletConfig,
  type WalletConfig,
} from "../../config";

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

async function createDeterministicSmartAccount(
  userSub: string,
  config: WalletConfig,
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

async function getKernelClientForUser(userSub: string, config: WalletConfig) {
  const { chain, rpcTransport, bundlerTransport, ownerPrivateKey, chainId, provider } = config;

  const linkage = await getSmartAccountLinkage(userSub, chainId, provider);
  if (!linkage || linkage.provisioningStatus !== "ready" || !linkage.smartAccountAddress) {
    throw new Error(`Smart account not ready for user ${userSub}. Current status: ${linkage?.provisioningStatus ?? "not found"}`);
  }

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

  if (account.address.toLowerCase() !== linkage.smartAccountAddress.toLowerCase()) {
    throw new Error(
      `Account address mismatch: expected ${linkage.smartAccountAddress}, got ${account.address}`,
    );
  }

  const kernelClient = createKernelAccountClient({
    account,
    chain,
    bundlerTransport,
  });

  return kernelClient;
}

export class ZeroDevSmartAccountAdapter implements ISmartAccountProviderAdapter {
  readonly id: SmartAccountProviderId = "zerodev";

  readonly metadata: SmartAccountProviderMetadata = {
    id: "zerodev",
    displayName: "ZeroDev Kernel",
    capabilities: {
      serverProvisioning: true,
      userOpSubmission: true,
      externalWallet: false,
    },
  };

  isEnabled(): boolean {
    return isSmartAccountProvisioningEnabled();
  }

  getChainId(): string {
    if (!this.isEnabled()) {
      return process.env.SMART_ACCOUNT_CHAIN_ID || "1";
    }
    return getWalletConfig().chainId;
  }

  async ensureSmartAccountForUser(userSub: string): Promise<ProvisioningResult> {
    if (!this.isEnabled()) {
      return {
        status: "pending",
        chainId: this.getChainId(),
        provider: this.id,
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

  async getSmartAccountForUser(userSub: string): Promise<SmartAccountLinkage | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const config = getWalletConfig();
    const linkage = await getSmartAccountLinkage(userSub, config.chainId, config.provider);
    if (!linkage) {
      return null;
    }

    return {
      userSub: linkage.userSub,
      chainId: linkage.chainId,
      provider: linkage.provider,
      smartAccountAddress: linkage.smartAccountAddress ?? undefined,
      provisioningStatus: linkage.provisioningStatus,
      lastError: linkage.lastError ?? undefined,
      createdAt: linkage.createdAt,
      updatedAt: linkage.updatedAt,
    };
  }

  async buildAndSubmitUserOp(userSub: string, calls: CallInput[]): Promise<UserOpResult> {
    const config = getWalletConfig();
    const kernelClient = await getKernelClientForUser(userSub, config);

    const callData = await kernelClient.account.encodeCalls(
      calls.map((call) => ({
        to: call.to,
        value: call.value ?? BigInt(0),
        data: call.data ?? "0x",
      })),
    );

    const userOpHash = await kernelClient.sendUserOperation({
      callData,
    });

    return { userOpHash };
  }

  async buildAndSubmitEncodedUserOp(userSub: string, calls: EncodedCallInput[]): Promise<UserOpResult> {
    const encodedCalls: CallInput[] = calls.map((call) => ({
      to: call.to,
      value: call.value,
      data: encodeFunctionData({
        abi: call.abi,
        functionName: call.functionName,
        args: call.args ?? [],
      }),
    }));

    return this.buildAndSubmitUserOp(userSub, encodedCalls);
  }

  async waitForUserOpReceipt(
    userSub: string,
    userOpHash: Hex,
    timeoutMs: number = 60000,
  ): Promise<UserOpReceipt> {
    const config = getWalletConfig();
    const kernelClient = await getKernelClientForUser(userSub, config);

    try {
      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: timeoutMs,
      });

      return {
        userOpHash,
        success: receipt.success,
        transactionHash: receipt.receipt.transactionHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        return {
          userOpHash,
          success: false,
        };
      }
      throw error;
    }
  }

  async submitUserOpAndWait(
    userSub: string,
    calls: CallInput[],
    timeoutMs: number = 60000,
  ): Promise<UserOpReceipt> {
    const { userOpHash } = await this.buildAndSubmitUserOp(userSub, calls);
    return this.waitForUserOpReceipt(userSub, userOpHash, timeoutMs);
  }
}

export const zerodevSmartAccountAdapter = new ZeroDevSmartAccountAdapter();
