import { NextRequest, NextResponse } from "next/server";

import { exchangeGoogleCodeForIdentity, getAppBaseUrl } from "@/lib/auth/google-oidc";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import {
  APP_SESSION_COOKIE_NAME,
  createAppSession,
  consumeOAuthFlowSession,
  OAUTH_FLOW_COOKIE_NAME,
  upsertGoogleUser,
} from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToApp(request: NextRequest, path: string): NextResponse {
  const target = new URL(path, getAppBaseUrl(request.nextUrl.origin));
  return NextResponse.redirect(target);
}

function clearOAuthFlowCookie(response: NextResponse): void {
  response.cookies.set({
    name: OAUTH_FLOW_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
}

export async function GET(request: NextRequest) {
  const oauthCookie = request.cookies.get(OAUTH_FLOW_COOKIE_NAME)?.value;
  const flowSession = await consumeOAuthFlowSession(oauthCookie);

  if (!flowSession) {
    const response = redirectToApp(request, "/?authError=missing_session");
    clearOAuthFlowCookie(response);
    return response;
  }

  const state = request.nextUrl.searchParams.get("state");
  if (!state || state !== flowSession.state) {
    const response = redirectToApp(request, "/?authError=invalid_state");
    clearOAuthFlowCookie(response);
    return response;
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    const response = redirectToApp(request, "/?authError=missing_code");
    clearOAuthFlowCookie(response);
    return response;
  }

  try {
    const identity = await exchangeGoogleCodeForIdentity({
      currentUrl: new URL(request.url),
      originFromRequest: request.nextUrl.origin,
      expectedState: flowSession.state,
      expectedNonce: flowSession.nonce,
      codeVerifier: flowSession.codeVerifier,
    });

    const user = await upsertGoogleUser(identity);
    const appSession = await createAppSession(user.sub);
    const safeReturnTo = sanitizeReturnTo(flowSession.returnTo);

    const response = redirectToApp(request, safeReturnTo);
    clearOAuthFlowCookie(response);
    response.cookies.set({
      name: APP_SESSION_COOKIE_NAME,
      value: appSession.cookieValue,
      httpOnly: true,
      secure: getAppBaseUrl(request.nextUrl.origin).startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: appSession.maxAgeSeconds,
    });

    return response;
  } catch {
    const response = redirectToApp(request, "/?authError=token_exchange_failed");
    clearOAuthFlowCookie(response);
    return response;
  }
}
