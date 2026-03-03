import { NextRequest, NextResponse } from "next/server";
import { executeDueDcaPositions } from "@/lib/dca/executors";
import type { CREExecutionRequest } from "@/lib/dca/executors/types";
import { resolveDcaExecutionProvider } from "@/lib/dca/execution-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    if (!validateBearerToken(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as CREExecutionRequest;
    const { consensusPrice } = body;

    if (!consensusPrice) {
      return NextResponse.json(
        { error: "Missing required field: consensusPrice" },
        { status: 400 },
      );
    }

    const provider = resolveDcaExecutionProvider();
    const execution = await executeDueDcaPositions(body);

    return NextResponse.json({
      ...execution,
      provider,
      consensusPrice: body.consensusPrice,
      executionTimestamp: body.executionTimestamp,
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
