import { NextRequest, NextResponse } from "next/server";

import "@/lib/auth/providers/setup";
import "@/lib/wallet/providers/setup";
import { AuthFacade } from "@/lib/auth/providers";
import { SmartAccountFacade } from "@/lib/wallet/providers";
import { APP_SESSION_COOKIE_NAME, getAppSession, getUserBySub } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authMetadata = AuthFacade.getActiveProviderMetadata();
  const sessionCookie = request.cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  const session = await getAppSession(sessionCookie);

  if (!session) {
    return NextResponse.json({
      authProvider: authMetadata.id,
      authenticated: false,
      user: null,
      wallet: null,
    });
  }

  const user = await getUserBySub(session.userSub);
  if (!user) {
    return NextResponse.json({
      authProvider: authMetadata.id,
      authenticated: false,
      user: null,
      wallet: null,
    });
  }

  let wallet = null;
  if (SmartAccountFacade.isEnabled()) {
    try {
      const linkage = await SmartAccountFacade.getSmartAccountForUser(user.sub);
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
    authProvider: authMetadata.id,
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
