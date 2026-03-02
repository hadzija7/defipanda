import { RhinestoneSDK } from "@rhinestone/sdk";
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
import { buildBackendDcaSession } from "@/lib/wallet/rhinestone-sessions";
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

export async function executeRhinestoneDca(
  body: CREExecutionRequest,
): Promise<ExecutionResponse> {
  const duePositions = await getDuePositions("reown_appkit");
  if (duePositions.length === 0) {
    return { ok: true, executionsTriggered: 0, results: [] };
  }

  const backendPrivateKey = getRequiredEnv("SMART_ACCOUNT_OWNER_PRIVATE_KEY") as Hex;
  const rhinestoneApiKey = getRequiredEnv("RHINESTONE_API_KEY");
  const backendSignerAccount = privateKeyToAccount(backendPrivateKey);
  const chain = activeNetwork.chain;

  const rhinestone = new RhinestoneSDK({
    apiKey: rhinestoneApiKey,
    endpointUrl: "https://v1.orchestrator.rhinestone.dev",
  });

  const publicClient = createPublicClient({
    chain: activeNetwork.chain,
    transport: http(),
  });

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
        `DCA swap (rhinestone): position=${position.id} account=${position.smartAccountAddress} ` +
          `amountIn=${formatUnits(amountIn, activeNetwork.usdcDecimals)} USDC ` +
          `oracleMinOutput=${formatUnits(referenceMinOutput, activeNetwork.wethDecimals)} WETH actualMinOutput=0`,
      );

      if (!position.sessionEnableSignature || !position.sessionHashesAndChainIds) {
        const errorMsg = "Session not granted: user must activate DCA from the frontend first";
        results.push({
          positionId: position.id,
          user: position.smartAccountAddress,
          amountIn: amountIn.toString(),
          txHash: null,
          error: errorMsg,
        });
        continue;
      }

      const rhinestoneAccount = await rhinestone.createAccount({
        initData: { address: position.smartAccountAddress as Address },
        owners: {
          type: "ecdsa" as const,
          accounts: [backendSignerAccount],
        },
        experimental_sessions: { enabled: true },
      });

      const { session } = buildBackendDcaSession({
        backendSignerPrivateKey: backendPrivateKey,
        chain,
        inputTokenAddress: activeNetwork.usdc,
        swapRouterAddress: activeNetwork.uniswapV3SwapRouter02,
      });

      const storedHashes = JSON.parse(position.sessionHashesAndChainIds) as Array<{
        chainId: string;
        sessionDigest: string;
      }>;
      const enableData = {
        userSignature: position.sessionEnableSignature as Hex,
        hashesAndChainIds: storedHashes.map((h) => ({
          chainId: BigInt(h.chainId),
          sessionDigest: h.sessionDigest as Hex,
        })),
        sessionToEnableIndex: 0,
      };

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
            recipient: position.smartAccountAddress as `0x${string}`,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });

      const prepared = await rhinestoneAccount.prepareTransaction({
        chain,
        calls: [
          { to: activeNetwork.usdc, value: BigInt(0), data: approveCalldata },
          { to: activeNetwork.uniswapV3SwapRouter02, value: BigInt(0), data: swapCalldata },
        ],
        signers: {
          type: "experimental_session" as const,
          session,
          enableData,
        },
      });

      const signed = await rhinestoneAccount.signTransaction(prepared);
      const txResult = await rhinestoneAccount.submitTransaction(signed);
      const executionResult = await rhinestoneAccount.waitForExecution(txResult);

      let txHash: string | null = null;
      if (executionResult && typeof executionResult === "object" && "fill" in executionResult) {
        txHash = (executionResult as { fill: { hash?: string } }).fill.hash ?? null;
      }

      await markExecuted(position.id, txHash, null);

      results.push({
        positionId: position.id,
        user: position.smartAccountAddress,
        amountIn: amountIn.toString(),
        txHash,
      });
    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : "Unknown error";
      if (err && typeof err === "object") {
        const sdkErr = err as Record<string, unknown>;
        if (sdkErr._context) {
          errorMsg += ` | context: ${JSON.stringify(sdkErr._context)}`;
        }
      }

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

