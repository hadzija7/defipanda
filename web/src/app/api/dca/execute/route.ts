import { NextRequest, NextResponse } from "next/server";
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
    const chain = activeNetwork.chain;

    const rhinestone = new RhinestoneSDK({
      apiKey: rhinestoneApiKey,
      endpointUrl: "https://v1.orchestrator.rhinestone.dev",
    });

    const publicClient = createPublicClient({
      chain: activeNetwork.chain,
      transport: http(),
    });

    const ethPriceRaw = BigInt(consensusPrice);
    const slippageBps = BigInt(maxSlippageBps ?? 50);

    const results: ExecutionResult[] = [];

    // --- Execute each due position sequentially (nonce ordering) ---
    for (const position of duePositions) {
      try {
        const amountIn = BigInt(position.amountUsdc);

        // --- Pre-check: does the smart account have enough USDC? ---
        const usdcBalance = await publicClient.readContract({
          address: activeNetwork.usdc,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [position.smartAccountAddress as Address],
        });

        if (usdcBalance < amountIn) {
          const errorMsg = `Insufficient USDC: balance=${formatUnits(usdcBalance, activeNetwork.usdcDecimals)}, needed=${formatUnits(amountIn, activeNetwork.usdcDecimals)}`;
          console.warn(
            `Skipping position ${position.id} (${position.smartAccountAddress}): ${errorMsg}`,
          );
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

        // Calculate reference minOutput from oracle for logging,
        // but use 0 for the actual swap on testnet — the Chainlink oracle price
        // and the Uniswap testnet pool price can diverge significantly.
        const exp20 = BigInt("100000000000000000000");
        const bps10k = BigInt(10_000);
        const rawOutput = (amountIn * exp20) / ethPriceRaw;
        const referenceMinOutput = (rawOutput * (bps10k - slippageBps)) / bps10k;

        // On testnet, pools have thin/mismatched liquidity vs Chainlink oracle price.
        // Accept any output to avoid reverts; real slippage protection lives on mainnet.
        const amountOutMinimum = BigInt(0);

        console.log(
          `DCA swap: position=${position.id} account=${position.smartAccountAddress} ` +
          `amountIn=${formatUnits(amountIn, activeNetwork.usdcDecimals)} USDC ` +
          `balance=${formatUnits(usdcBalance, activeNetwork.usdcDecimals)} USDC ` +
          `oracleMinOutput=${formatUnits(referenceMinOutput, activeNetwork.wethDecimals)} WETH ` +
          `actualMinOutput=0 (testnet) fee=${activeNetwork.uniswapV3PoolFee}`,
        );

        if (!position.sessionEnableSignature || !position.sessionHashesAndChainIds) {
          const errorMsg = "Session not granted: user must activate DCA from the frontend first";
          console.warn(`Skipping position ${position.id}: ${errorMsg}`);
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
          `DCA executed: position=${position.id} user=${position.smartAccountAddress} ` +
          `amountIn=${formatUnits(amountIn, activeNetwork.usdcDecimals)} USDC txHash=${txHash}`,
        );
      } catch (err) {
        let errorMsg = err instanceof Error ? err.message : "Unknown error";

        // Capture Rhinestone SDK error context for debugging
        if (err && typeof err === "object") {
          const sdkErr = err as Record<string, unknown>;
          if (sdkErr._context) {
            const ctx = JSON.stringify(sdkErr._context);
            console.error(`Rhinestone error context for ${position.smartAccountAddress}:`, ctx);
            errorMsg += ` | context: ${ctx}`;
          }
        }

        await markExecuted(position.id, null, errorMsg.slice(0, 500)).catch((e) =>
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
