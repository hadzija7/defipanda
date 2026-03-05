import { NextRequest, NextResponse } from "next/server";
import { isOnboardingCompleted } from "@/lib/onboarding/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const provider = request.nextUrl.searchParams.get("provider") ?? "reown_appkit";

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  try {
    const completed = await isOnboardingCompleted(address, provider);
    return NextResponse.json({ completed });
  } catch (error) {
    console.error("Failed to check onboarding status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
