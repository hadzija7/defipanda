import { NextRequest, NextResponse } from "next/server";

import { APP_SESSION_COOKIE_NAME, destroyAppSession } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const sessionCookie = request.cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  await destroyAppSession(sessionCookie);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });

  return response;
}
