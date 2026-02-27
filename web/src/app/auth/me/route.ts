import { NextRequest, NextResponse } from "next/server";

import { APP_SESSION_COOKIE_NAME, getAppSession, getUserBySub } from "@/lib/auth/store";
import { getSmartAccountForUser, isSmartAccountProvisioningEnabled } from "@/lib/wallet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  const session = await getAppSession(sessionCookie);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      wallet: null,
    });
  }

  const user = await getUserBySub(session.userSub);
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      wallet: null,
    });
  }

  let wallet = null;
  if (isSmartAccountProvisioningEnabled()) {
    try {
      const linkage = await getSmartAccountForUser(user.sub);
      if (linkage) {
        wallet = {
          status: linkage.provisioningStatus,
          address: linkage.smartAccountAddress ?? null,
          chainId: linkage.chainId,
          provider: linkage.provider,
          error: linkage.lastError ?? null,
        };
      }
    } catch (error) {
      console.error("Failed to fetch wallet status:", error);
    }
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
    wallet,
  });
}
