import { NextRequest, NextResponse } from "next/server";
import { RhinestoneSDK } from "@rhinestone/sdk";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { buildBackendDcaSession } from "@/lib/wallet/rhinestone-sessions";
import {
  USDC_ADDRESS,
  WETH_ADDRESS,
  UNISWAP_V3_SWAP_ROUTER_02,
  UNISWAP_V3_POOL_FEE,
  swapRouter02Abi,
} from "@/lib/constants/base-sepolia";
import { getDuePositions, markExecuted } from "@/lib/dca/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function validateBearerToken(request: NextRequest): boolean {
  const expectedToken = process.env.CRE_BACKEND_AUTH_TOKEN;
  if (!expectedToken) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  if (token.length !== expectedToken.length) return false;

  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CREExecutionRequest {
  consensusPrice: string;
  maxSlippageBps: number;
  executionTimestamp: number;
  triggerTimestamp?: number;
  roundId?: string;
}

interface ExecutionResult {
  positionId: string;
  user: string;
  amountIn: string;
  txHash: string | null;
  error?: string;
}

// ---------------------------------------------------------------------------
// POST /api/dca/execute
// ---------------------------------------------------------------------------

/**
 * Called by CRE workflow with consensus-verified market data.
 * Reads all due DCA positions from the database (active + interval elapsed),
 * executes USDC->WETH swaps on user smart accounts via Rhinestone session keys.
 *
 * The backend signer is NOT the account owner — it holds a scoped session key
 * that the user pre-authorized. Transactions are submitted as orchestrator
 * intents using the prepare → sign → submit flow.
 */
export async function POST(request: NextRequest) {
  try {
    // --- Auth ---
    if (!validateBearerToken(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CREExecutionRequest;
    const { consensusPrice, maxSlippageBps, executionTimestamp } = body;

    if (!consensusPrice) {
      return NextResponse.json(
        { error: "Missing required field: consensusPrice" },
        { status: 400 },
      );
    }

    // --- Read due positions from DB (interval check is the sole dedup) ---
    const duePositions = await getDuePositions();

    if (duePositions.length === 0) {
      return NextResponse.json({
        ok: true,
        executionsTriggered: 0,
        results: [] as ExecutionResult[],
      });
    }

    // --- Setup ---
    const backendPrivateKey = getRequiredEnv("SMART_ACCOUNT_OWNER_PRIVATE_KEY") as Hex;
    const rhinestoneApiKey = getRequiredEnv("RHINESTONE_API_KEY");
    const backendSignerAccount = privateKeyToAccount(backendPrivateKey);
    const chain = baseSepolia;

    const rhinestone = new RhinestoneSDK({
      apiKey: rhinestoneApiKey,
      endpointUrl: "https://v1.orchestrator.rhinestone.dev",
    });

    const ethPriceRaw = BigInt(consensusPrice);
    const slippageBps = BigInt(maxSlippageBps ?? 50);

    const results: ExecutionResult[] = [];

    // --- Execute each due position sequentially (nonce ordering) ---
    for (const position of duePositions) {
      try {
        const amountIn = BigInt(position.amountUsdc);

        // minOutputWeth = (amountIn * 1e20) / ethPrice * (10000 - slippage) / 10000
        const exp20 = BigInt("100000000000000000000");
        const bps10k = BigInt(10_000);
        const rawOutput = (amountIn * exp20) / ethPriceRaw;
        const minOutput = (rawOutput * (bps10k - slippageBps)) / bps10k;

        // Target the USER's smart account via initData, not the backend's own account.
        // The backend signer is a session key holder, not the account owner.
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
          inputTokenAddress: USDC_ADDRESS,
          swapRouterAddress: UNISWAP_V3_SWAP_ROUTER_02,
        });

        const approveCalldata = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [UNISWAP_V3_SWAP_ROUTER_02, amountIn],
        });

        const swapCalldata = encodeFunctionData({
          abi: swapRouter02Abi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: USDC_ADDRESS,
              tokenOut: WETH_ADDRESS,
              fee: UNISWAP_V3_POOL_FEE,
              recipient: position.smartAccountAddress as `0x${string}`,
              amountIn,
              amountOutMinimum: minOutput,
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        });

        // Use the manual prepare → sign → submit flow.
        // sendTransaction() blocks experimental_session signers in SDK v1.2.14,
        // but the manual flow supports them through the intent-based orchestrator.
        const prepared = await rhinestoneAccount.prepareTransaction({
          chain,
          calls: [
            { to: USDC_ADDRESS, value: BigInt(0), data: approveCalldata },
            { to: UNISWAP_V3_SWAP_ROUTER_02, value: BigInt(0), data: swapCalldata },
          ],
          signers: {
            type: "experimental_session" as const,
            session,
          },
        });

        const signed = await rhinestoneAccount.signTransaction(prepared);
        const txResult = await rhinestoneAccount.submitTransaction(signed);
        const executionResult = await rhinestoneAccount.waitForExecution(txResult);

        let txHash: string | null = null;
        if (executionResult && typeof executionResult === "object") {
          if ("fill" in executionResult) {
            txHash = (executionResult as { fill: { hash?: string } }).fill.hash ?? null;
          }
        }

        await markExecuted(position.id, txHash, null);

        results.push({
          positionId: position.id,
          user: position.smartAccountAddress,
          amountIn: amountIn.toString(),
          txHash,
        });

        console.log(
          `DCA executed: position=${position.id} user=${position.smartAccountAddress} amountIn=${amountIn} txHash=${txHash}`,
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";

        await markExecuted(position.id, null, errorMsg).catch((e) =>
          console.error("Failed to record execution error:", e),
        );

        results.push({
          positionId: position.id,
          user: position.smartAccountAddress,
          amountIn: position.amountUsdc,
          txHash: null,
          error: errorMsg,
        });

        console.error(`DCA execution failed for ${position.smartAccountAddress}:`, err);
      }
    }

    return NextResponse.json({
      ok: true,
      executionsTriggered: duePositions.length,
      results,
      consensusPrice,
      executionTimestamp,
    });
  } catch (error) {
    console.error("DCA execution error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown DCA execution error",
      },
      { status: 500 },
    );
  }
}
