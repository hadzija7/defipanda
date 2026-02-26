import * as oidc from "openid-client";

const GOOGLE_ISSUER = new URL("https://accounts.google.com");
const GOOGLE_ALLOWED_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_SCOPES = "openid email profile";

let oidcConfigPromise: Promise<oidc.Configuration> | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getGoogleClientId(): string {
  return requireEnv("GOOGLE_OAUTH_CLIENT_ID");
}

function getGoogleClientSecret(): string {
  return requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");
}

async function getOidcConfig(): Promise<oidc.Configuration> {
  if (!oidcConfigPromise) {
    oidcConfigPromise = oidc.discovery(GOOGLE_ISSUER, getGoogleClientId(), getGoogleClientSecret());
  }
  return oidcConfigPromise;
}

export function getAppBaseUrl(originFromRequest: string): string {
  return process.env.APP_BASE_URL ?? originFromRequest;
}

export function getGoogleRedirectUri(originFromRequest: string): string {
  return `${getAppBaseUrl(originFromRequest)}/auth/google/callback`;
}

export type GoogleLoginRequest = {
  originFromRequest: string;
  state: string;
  nonce: string;
  codeVerifier: string;
};

export async function buildGoogleAuthorizationUrl(input: GoogleLoginRequest): Promise<URL> {
  const config = await getOidcConfig();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(input.codeVerifier);

  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: getGoogleRedirectUri(input.originFromRequest),
    scope: GOOGLE_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: input.state,
    nonce: input.nonce,
  });
}

export type GoogleExchangeInput = {
  currentUrl: URL;
  originFromRequest: string;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
};

type GoogleIdentity = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function validateGoogleIdTokenClaims(claims: unknown, expectedNonce: string): GoogleIdentity {
  if (!claims || typeof claims !== "object") {
    throw new Error("Missing ID token claims.");
  }

  const idTokenClaims = claims as Record<string, unknown>;

  const issuer = idTokenClaims.iss;
  if (typeof issuer !== "string" || !GOOGLE_ALLOWED_ISSUERS.has(issuer)) {
    throw new Error("Invalid Google ID token issuer.");
  }

  const audience = idTokenClaims.aud;
  const clientId = getGoogleClientId();
  const audienceIsValid =
    (typeof audience === "string" && audience === clientId) ||
    (Array.isArray(audience) && audience.includes(clientId));
  if (!audienceIsValid) {
    throw new Error("Invalid Google ID token audience.");
  }

  const expiresAt = idTokenClaims.exp;
  if (typeof expiresAt !== "number" || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("Expired Google ID token.");
  }

  if (idTokenClaims.nonce !== expectedNonce) {
    throw new Error("Google ID token nonce mismatch.");
  }

  const sub = idTokenClaims.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Missing Google subject claim.");
  }

  return {
    sub,
    email: typeof idTokenClaims.email === "string" ? idTokenClaims.email : undefined,
    email_verified: typeof idTokenClaims.email_verified === "boolean" ? idTokenClaims.email_verified : undefined,
    name: typeof idTokenClaims.name === "string" ? idTokenClaims.name : undefined,
    picture: typeof idTokenClaims.picture === "string" ? idTokenClaims.picture : undefined,
  };
}

export async function exchangeGoogleCodeForIdentity(input: GoogleExchangeInput): Promise<GoogleIdentity> {
  const config = await getOidcConfig();
  const tokenResponse = await oidc.authorizationCodeGrant(
    config,
    input.currentUrl,
    {
      expectedState: input.expectedState,
      expectedNonce: input.expectedNonce,
      pkceCodeVerifier: input.codeVerifier,
      idTokenExpected: true,
    },
    { redirect_uri: getGoogleRedirectUri(input.originFromRequest) },
  );

  const claims = tokenResponse.claims();
  return validateGoogleIdTokenClaims(claims, input.expectedNonce);
}

export function createState(): string {
  return oidc.randomState();
}

export function createNonce(): string {
  return oidc.randomNonce();
}

export function createCodeVerifier(): string {
  return oidc.randomPKCECodeVerifier();
}
