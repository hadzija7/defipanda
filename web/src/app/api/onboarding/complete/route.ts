import { NextRequest, NextResponse } from "next/server";
import { markOnboardingCompleted } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smartAccountAddress, smartAccountProvider } = body;

    if (!smartAccountAddress) {
      return NextResponse.json(
        { error: "Missing smartAccountAddress" },
        { status: 400 },
      );
    }

    await markOnboardingCompleted(
      smartAccountAddress,
      smartAccountProvider ?? "reown_appkit",
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
