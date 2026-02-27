import { NextRequest, NextResponse } from "next/server";

import "@/lib/auth/providers/setup";
import { AuthFacade } from "@/lib/auth/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? undefined;
  const origin = request.nextUrl.origin;

  const loginResult = await AuthFacade.initiateLogin({ returnTo, origin });

  if (loginResult.type === "redirect") {
    return NextResponse.redirect(new URL(loginResult.url, origin));
  }

  return NextResponse.redirect(new URL(returnTo || "/", origin));
}
