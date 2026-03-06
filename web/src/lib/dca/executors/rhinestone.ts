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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const orchestratorMod = require("@rhinestone/sdk/dist/src/orchestrator") as {
  getOrchestrator: (apiKey: string, url: string) => {
    getIntentOpStatus: (id: bigint) => Promise<{
      status: string;
      fillTransactionHash?: string;
      claims: { claimTransactionHash?: string; chainId: number }[];
    }>;
  };
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "FILLED", "FAILED", "EXPIRED"]);
const INTENT_POLL_INTERVAL_MS = 3_000;
const INTENT_POLL_MAX_MS = 120_000;

async function waitForIntentFill(
  apiKey: string,
  endpointUrl: string,
  intentId: bigint,
): Promise<{ status: string; fillTransactionHash?: string }> {
  const orchestrator = orchestratorMod.getOrchestrator(apiKey, endpointUrl);
  const start = Date.now();
  while (Date.now() - start < INTENT_POLL_MAX_MS) {
    const s = await orchestrator.getIntentOpStatus(intentId);
    if (TERMINAL_STATUSES.has(s.status)) return s;
    await new Promise((r) => setTimeout(r, INTENT_POLL_INTERVAL_MS));
  }
  return { status: "TIMEOUT" };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

async function executeOnePosition(
  position: Awaited<ReturnType<typeof getDuePositions>>[number],
  ctx: {
    publicClient: ReturnType<typeof createPublicClient>;
    rhinestone: RhinestoneSDK;
    rhinestoneApiKey: string;
    backendSignerAccount: ReturnType<typeof privateKeyToAccount>;
    backendPrivateKey: Hex;
    chain: typeof activeNetwork.chain;
    ethPriceRaw: bigint;
    slippageBps: bigint;
  },
): Promise<ExecutionResult> {
  const {
    publicClient,
    rhinestone,
    rhinestoneApiKey,
    backendSignerAccount,
    backendPrivateKey,
    chain,
    ethPriceRaw,
    slippageBps,
  } = ctx;

  try {
    const accountCode = await publicClient.getCode({
      address: position.smartAccountAddress as Address,
    });
    if (!accountCode || accountCode === "0x") {
      const errorMsg = `Smart account not deployed: ${position.smartAccountAddress}. User must re-activate DCA from the frontend.`;
      console.warn(`[rhinestone-executor] ${errorMsg}`);
      return {
        positionId: position.id,
        user: position.smartAccountAddress,
        amountIn: position.amountUsdc,
        txHash: null,
        error: errorMsg,
      };
    }

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
      return {
        positionId: position.id,
        user: position.smartAccountAddress,
        amountIn: amountIn.toString(),
        txHash: null,
        error: errorMsg,
      };
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

    if (!position.sessionEnableSignature) {
      return {
        positionId: position.id,
        user: position.smartAccountAddress,
        amountIn: amountIn.toString(),
        txHash: null,
        error: "Session not installed: user must activate DCA from the frontend first",
      };
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
      },
      sponsored: true,
    });

    const signed = await rhinestoneAccount.signTransaction(prepared);
    const txResult = await rhinestoneAccount.submitTransaction(signed);

    const intentId = (txResult as { id?: bigint }).id;
    console.log(
      `[rhinestone-executor] Intent submitted: id=${intentId?.toString()} type=${txResult.type}`,
    );

    if (!intentId) {
      throw new Error("No intent ID returned from submitTransaction");
    }

    const intentResult = await waitForIntentFill(
      rhinestoneApiKey,
      "https://v1.orchestrator.rhinestone.dev",
      intentId,
    );

    console.log(
      `[rhinestone-executor] Intent result: status=${intentResult.status} fillTxHash=${intentResult.fillTransactionHash ?? "none"}`,
    );

    const txHash = intentResult.fillTransactionHash ?? null;

    if (intentResult.status === "FAILED") {
      const errorMsg = `Intent failed (status=FAILED)`;
      await markExecuted(position.id, null, errorMsg).catch(console.error);
      return { positionId: position.id, user: position.smartAccountAddress, amountIn: amountIn.toString(), txHash: null, error: errorMsg };
    } else if (intentResult.status === "EXPIRED" || intentResult.status === "TIMEOUT") {
      const errorMsg = `Intent ${intentResult.status.toLowerCase()} without fill`;
      await markExecuted(position.id, null, errorMsg).catch(console.error);
      return { positionId: position.id, user: position.smartAccountAddress, amountIn: amountIn.toString(), txHash: null, error: errorMsg };
    } else if (txHash) {
      await markExecuted(position.id, txHash, null);
      return { positionId: position.id, user: position.smartAccountAddress, amountIn: amountIn.toString(), txHash };
    } else {
      const errorMsg = `Intent completed (status=${intentResult.status}) but no fillTxHash`;
      await markExecuted(position.id, null, errorMsg).catch(console.error);
      return { positionId: position.id, user: position.smartAccountAddress, amountIn: amountIn.toString(), txHash: null, error: errorMsg };
    }
  } catch (err) {
    let errorMsg = err instanceof Error ? err.message : "Unknown error";
    if (err && typeof err === "object") {
      const sdkErr = err as Record<string, unknown>;
      if (sdkErr._context) {
        errorMsg += ` | context: ${JSON.stringify(sdkErr._context)}`;
      }
    }

    await markExecuted(position.id, null, errorMsg.slice(0, 500)).catch(console.error);
    return {
      positionId: position.id,
      user: position.smartAccountAddress,
      amountIn: position.amountUsdc,
      txHash: null,
      error: errorMsg,
    };
  }
}

export async function executeRhinestoneDca(
  body: CREExecutionRequest,
): Promise<ExecutionResponse> {
  const [reownDuePositions, privyDuePositions] = await Promise.all([
    getDuePositions("reown_appkit"),
    getDuePositions("privy"),
  ]);
  const duePositions = [...reownDuePositions, ...privyDuePositions];
  if (duePositions.length === 0) {
    return { ok: true, executionsTriggered: 0, results: [] };
  }

  const backendPrivateKey = getRequiredEnv("BACKEND_SIGNER_PRIVATE_KEY") as Hex;
  const rhinestoneApiKey = getRequiredEnv("RHINESTONE_API_KEY");
  const backendSignerAccount = privateKeyToAccount(backendPrivateKey);
  const chain = activeNetwork.chain;

  const rhinestone = new RhinestoneSDK({
    apiKey: rhinestoneApiKey,
    endpointUrl: "https://v1.orchestrator.rhinestone.dev",
  });

  const rpcUrl = process.env.NEXT_PUBLIC_PRIVY_RPC_URL || undefined;
  const publicClient = createPublicClient({
    chain: activeNetwork.chain,
    transport: http(rpcUrl),
  });

  const ethPriceRaw = BigInt(body.consensusPrice);
  const slippageBps = BigInt(body.maxSlippageBps ?? 50);

  const ctx = {
    publicClient,
    rhinestone,
    rhinestoneApiKey,
    backendSignerAccount,
    backendPrivateKey,
    chain,
    ethPriceRaw,
    slippageBps,
  };

  console.log(
    `[rhinestone-executor] Executing ${duePositions.length} positions sequentially`,
  );

  const results: ExecutionResult[] = [];
  for (const position of duePositions) {
    const result = await executeOnePosition(position, ctx);
    results.push(result);
  }

  return {
    ok: true,
    executionsTriggered: duePositions.length,
    results,
  };
}

