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

/**
 * POST /api/dca/trigger
 *
 * Fast endpoint for the CRE workflow. Validates the request, kicks off
 * DCA execution in the background (fire-and-forget), and returns 202
 * immediately so the CRE HTTP timeout is never hit.
 *
 * The original /api/dca/execute endpoint is preserved for synchronous
 * debugging and manual invocations.
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

    // Fire-and-forget: start execution but don't await it.
    // Node.js keeps the promise alive after the response is sent.
    executeDueDcaPositions(body)
      .then((result) => {
        console.log(
          `[dca-trigger] Background execution finished: provider=${provider} ` +
            `triggered=${result.executionsTriggered} ` +
            `successes=${result.results.filter((r) => !r.error).length} ` +
            `failures=${result.results.filter((r) => r.error).length}`,
        );
      })
      .catch((error) => {
        console.error("[dca-trigger] Background execution failed:", error);
      });

    return NextResponse.json(
      {
        accepted: true,
        provider,
        consensusPrice: body.consensusPrice,
        executionTimestamp: body.executionTimestamp,
        message: "DCA execution started in background",
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("[dca-trigger] Request handling error:", error);
    return NextResponse.json(
      {
        accepted: false,
        error:
          error instanceof Error ? error.message : "Unknown trigger error",
      },
      { status: 500 },
    );
  }
}
