import { NextRequest, NextResponse } from "next/server";

import { APP_SESSION_COOKIE_NAME, getAppSession, getUserBySub } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  const session = await getAppSession(sessionCookie);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  const user = await getUserBySub(session.userSub);
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      sub: user.sub,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      picture: user.picture,
    },
  });
}
