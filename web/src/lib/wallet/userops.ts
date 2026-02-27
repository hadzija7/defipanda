import { createPublicClient, type Address, type Hex, encodeFunctionData, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

import { getWalletConfig } from "./config";
import { getSmartAccountLinkage } from "@/lib/auth/store";

export type CallInput = {
  to: Address;
  value?: bigint;
  data?: Hex;
};

export type EncodedCallInput = {
  to: Address;
  value?: bigint;
  abi: Abi;
  functionName: string;
  args?: unknown[];
};

export type UserOpResult = {
  userOpHash: Hex;
};

export type UserOpReceipt = {
  userOpHash: Hex;
  success: boolean;
  transactionHash?: Hex;
};

async function getKernelClientForUser(userSub: string) {
  const config = getWalletConfig();
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

export async function buildAndSubmitUserOp(userSub: string, calls: CallInput[]): Promise<UserOpResult> {
  const kernelClient = await getKernelClientForUser(userSub);

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

export async function buildAndSubmitEncodedUserOp(
  userSub: string,
  calls: EncodedCallInput[],
): Promise<UserOpResult> {
  const encodedCalls: CallInput[] = calls.map((call) => ({
    to: call.to,
    value: call.value,
    data: encodeFunctionData({
      abi: call.abi,
      functionName: call.functionName,
      args: call.args ?? [],
    }),
  }));

  return buildAndSubmitUserOp(userSub, encodedCalls);
}

export async function waitForUserOpReceipt(
  userSub: string,
  userOpHash: Hex,
  timeoutMs: number = 60000,
): Promise<UserOpReceipt> {
  const kernelClient = await getKernelClientForUser(userSub);

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

export async function submitUserOpAndWait(
  userSub: string,
  calls: CallInput[],
  timeoutMs: number = 60000,
): Promise<UserOpReceipt> {
  const { userOpHash } = await buildAndSubmitUserOp(userSub, calls);
  return waitForUserOpReceipt(userSub, userOpHash, timeoutMs);
}
