import { NextRequest, NextResponse } from "next/server";
import { RhinestoneSDK } from "@rhinestone/sdk";
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { buildBackendDcaSession } from "@/lib/wallet/rhinestone-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * POST /api/dca/execute
 *
 * Backend DCA execution endpoint. Uses a Rhinestone session key to submit
 * a swap/transfer transaction on behalf of the user's smart account.
 *
 * Expected JSON body:
 * {
 *   "smartAccountAddress": "0x...",  // The user's Rhinestone smart account
 *   "tokenAddress": "0x...",         // ERC-20 token to transfer (e.g. USDC)
 *   "recipientAddress": "0x...",     // Destination for the DCA output
 *   "amount": "1000000",            // Amount in smallest unit (e.g. 1 USDC = 1000000)
 *   "chainId": 84532                // Target chain ID (default: Base Sepolia)
 * }
 *
 * This endpoint is designed to be called by Chainlink CRE or a cron scheduler.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      smartAccountAddress,
      tokenAddress,
      recipientAddress,
      amount,
    } = body as {
      smartAccountAddress: Address;
      tokenAddress: Address;
      recipientAddress: Address;
      amount: string;
      chainId?: number;
    };

    if (!smartAccountAddress || !tokenAddress || !recipientAddress || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: smartAccountAddress, tokenAddress, recipientAddress, amount" },
        { status: 400 },
      );
    }

    const backendPrivateKey = getRequiredEnv("SMART_ACCOUNT_OWNER_PRIVATE_KEY") as Hex;
    const rhinestoneApiKey = getRequiredEnv("RHINESTONE_API_KEY");

    const backendSignerAccount = privateKeyToAccount(backendPrivateKey);

    const rhinestone = new RhinestoneSDK({
      apiKey: rhinestoneApiKey,
      endpointUrl: "https://v1.orchestrator.rhinestone.dev",
    });

    const rhinestoneAccount = await rhinestone.createAccount({
      owners: {
        type: "ecdsa" as const,
        accounts: [backendSignerAccount],
      },
    });

    const { session } = buildBackendDcaSession({
      backendSignerPrivateKey: backendPrivateKey,
      tokenAddress,
    });

    const chain = baseSepolia;

    const transferCalldata = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipientAddress, BigInt(amount)],
    });

    const transaction = await rhinestoneAccount.sendTransaction({
      chain,
      calls: [
        {
          to: tokenAddress,
          value: BigInt(0),
          data: transferCalldata,
        },
      ],
      signers: {
        type: "experimental_session" as const,
        session,
      },
    });

    const result = await rhinestoneAccount.waitForExecution(transaction);

    let transactionHash: string | null = null;
    if (result && typeof result === "object") {
      if ("fillTransactionHash" in result) {
        transactionHash = result.fillTransactionHash as string;
      } else if ("transactionHash" in result) {
        transactionHash = result.transactionHash as string;
      }
    }

    return NextResponse.json({
      ok: true,
      smartAccountAddress,
      transaction,
      transactionHash,
      result,
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
