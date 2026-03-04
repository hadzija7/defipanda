import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { activeNetwork, swapRouter02Abi } from "@/lib/constants/networks";
import { getDuePositions, markExecuted } from "@/lib/dca/store";
import type { CREExecutionRequest, ExecutionResponse, ExecutionResult } from "./types";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getBundlerRpcUrl(): string {
  return process.env.ZERODEV_RPC_URL || getRequiredEnv("SMART_ACCOUNT_RPC_URL");
}

export async function executeZeroDevDca(
  body: CREExecutionRequest,
): Promise<ExecutionResponse> {
  const duePositions = await getDuePositions("zerodev");
  if (duePositions.length === 0) {
    return { ok: true, executionsTriggered: 0, results: [] };
  }

  const backendPrivateKey = getRequiredEnv("BACKEND_SIGNER_PRIVATE_KEY") as Hex;
  const backendSigner = privateKeyToAccount(backendPrivateKey);
  const entryPoint = getEntryPoint("0.7");
  const bundlerRpcUrl = getBundlerRpcUrl();

  const publicClient = createPublicClient({
    chain: activeNetwork.chain,
    transport: http(process.env.SMART_ACCOUNT_RPC_URL),
  });

  const sudoValidator = await signerToEcdsaValidator(publicClient, {
    signer: backendSigner,
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });
  const permissionSigner = await toECDSASigner({ signer: backendSigner });

  const ethPriceRaw = BigInt(body.consensusPrice);
  const slippageBps = BigInt(body.maxSlippageBps ?? 50);
  const results: ExecutionResult[] = [];

  for (const position of duePositions) {
    try {
      const amountIn = BigInt(position.amountUsdc);

      const usdcBalance = await publicClient.readContract({
        address: activeNetwork.usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [position.smartAccountAddress as Address],
      });

      if (usdcBalance < amountIn) {
        const errorMsg = `Insufficient USDC: balance=${formatUnits(usdcBalance, activeNetwork.usdcDecimals)}, needed=${formatUnits(amountIn, activeNetwork.usdcDecimals)}`;
        await markExecuted(position.id, null, errorMsg).catch(console.error);
        results.push({
          positionId: position.id,
          user: position.smartAccountAddress,
          amountIn: amountIn.toString(),
          txHash: null,
          error: errorMsg,
        });
        continue;
      }

      const exp20 = BigInt("100000000000000000000");
      const bps10k = BigInt(10_000);
      const rawOutput = (amountIn * exp20) / ethPriceRaw;
      const referenceMinOutput = (rawOutput * (bps10k - slippageBps)) / bps10k;
      const amountOutMinimum = BigInt(0);

      console.log(
        `DCA swap (zerodev): position=${position.id} account=${position.smartAccountAddress} ` +
          `amountIn=${formatUnits(amountIn, activeNetwork.usdcDecimals)} USDC ` +
          `oracleMinOutput=${formatUnits(referenceMinOutput, activeNetwork.wethDecimals)} WETH actualMinOutput=0`,
      );

      const account = position.zerodevPermissionAccount
        ? await deserializePermissionAccount(
            publicClient,
            entryPoint,
            KERNEL_V3_1,
            position.zerodevPermissionAccount,
            permissionSigner,
          )
        : await createKernelAccount(publicClient, {
            entryPoint,
            kernelVersion: KERNEL_V3_1,
            address: position.smartAccountAddress as Address,
            plugins: {
              sudo: sudoValidator,
            },
          });

      const kernelClient = createKernelAccountClient({
        account,
        chain: activeNetwork.chain,
        bundlerTransport: http(bundlerRpcUrl),
      });

      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [activeNetwork.uniswapV3SwapRouter02, amountIn],
      });
      const swapCalldata = encodeFunctionData({
        abi: swapRouter02Abi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: activeNetwork.usdc,
            tokenOut: activeNetwork.weth,
            fee: activeNetwork.uniswapV3PoolFee,
            recipient: position.smartAccountAddress as Address,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });

      const callData = await account.encodeCalls([
        { to: activeNetwork.usdc, value: BigInt(0), data: approveCalldata },
        { to: activeNetwork.uniswapV3SwapRouter02, value: BigInt(0), data: swapCalldata },
      ]);

      const userOpHash = await kernelClient.sendUserOperation({
        callData,
      });
      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
        timeout: 60_000,
      });
      const txHash = receipt.receipt.transactionHash ?? null;

      await markExecuted(position.id, txHash, null);
      results.push({
        positionId: position.id,
        user: position.smartAccountAddress,
        amountIn: amountIn.toString(),
        txHash,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      await markExecuted(position.id, null, errorMsg.slice(0, 500)).catch(console.error);
      results.push({
        positionId: position.id,
        user: position.smartAccountAddress,
        amountIn: position.amountUsdc,
        txHash: null,
        error: errorMsg,
      });
    }
  }

  return {
    ok: true,
    executionsTriggered: duePositions.length,
    results,
  };
}

