import { NextRequest, NextResponse } from "next/server";
import {
  getPositionBySmartAccount,
  upsertPosition,
  type DcaPosition,
} from "@/lib/dca/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/dca/strategy?address=0x...
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "Missing required query param: address" },
      { status: 400 },
    );
  }

  try {
    const position = await getPositionBySmartAccount(address);
    return NextResponse.json({ strategy: position });
  } catch (error) {
    console.error("Failed to load DCA strategy:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/dca/strategy
// ---------------------------------------------------------------------------

interface CreateStrategyRequest {
  smartAccountAddress: string;
  ownerAddress: string;
  dcaAmountUsdc: string;
  intervalSeconds: number;
  active: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateStrategyRequest;
    const {
      smartAccountAddress,
      ownerAddress,
      dcaAmountUsdc,
      intervalSeconds,
      active,
    } = body;

    if (!smartAccountAddress || !ownerAddress || !dcaAmountUsdc) {
      return NextResponse.json(
        { error: "Missing required fields: smartAccountAddress, ownerAddress, dcaAmountUsdc" },
        { status: 400 },
      );
    }

    const amountNum = Number(dcaAmountUsdc);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: "dcaAmountUsdc must be a positive number (in smallest unit)" },
        { status: 400 },
      );
    }

    if (!intervalSeconds || intervalSeconds < 10) {
      return NextResponse.json(
        { error: "intervalSeconds must be at least 10" },
        { status: 400 },
      );
    }

    const position: DcaPosition = await upsertPosition({
      smartAccountAddress,
      ownerAddress,
      amountUsdc: dcaAmountUsdc,
      intervalSeconds,
      active: active ?? true,
    });

    return NextResponse.json({ ok: true, strategy: position });
  } catch (error) {
    console.error("Failed to save DCA strategy:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
