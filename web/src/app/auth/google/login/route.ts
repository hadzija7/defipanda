import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthorizationUrl,
  createCodeVerifier,
  createNonce,
  createState,
  getAppBaseUrl,
} from "@/lib/auth/google-oidc";
import { createOAuthFlowSession, OAUTH_FLOW_COOKIE_NAME } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const state = createState();
  const nonce = createNonce();
  const codeVerifier = createCodeVerifier();

  const returnToParam = request.nextUrl.searchParams.get("returnTo");
  const returnTo = returnToParam?.startsWith("/") ? returnToParam : "/";

  const oauthFlow = await createOAuthFlowSession({
    state,
    nonce,
    codeVerifier,
    returnTo,
  });

  const authorizationUrl = await buildGoogleAuthorizationUrl({
    originFromRequest: request.nextUrl.origin,
    state,
    nonce,
    codeVerifier,
  });

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set({
    name: OAUTH_FLOW_COOKIE_NAME,
    value: oauthFlow.cookieValue,
    httpOnly: true,
    secure: getAppBaseUrl(request.nextUrl.origin).startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: oauthFlow.maxAgeSeconds,
  });

  return response;
}
