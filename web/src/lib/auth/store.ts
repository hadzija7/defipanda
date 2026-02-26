import { createHmac, randomUUID } from "node:crypto";

import { query } from "@/lib/db/postgres";

type OAuthFlowSession = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
  returnTo: string;
};

type AppSession = {
  userSub: string;
  createdAt: number;
  expiresAt: number;
};

type UserRecord = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  createdAt: number;
  updatedAt: number;
};

const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000;
const APP_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const OAUTH_FLOW_COOKIE_NAME = "defipanda_oauth_flow";
export const APP_SESSION_COOKIE_NAME = "defipanda_session";

function getCookieSecret(): string {
  const configuredSecret = process.env.AUTH_SESSION_SECRET;
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET must be configured in production.");
  }

  return "defipanda-local-dev-secret-change-me";
}

function sign(value: string): string {
  const digest = createHmac("sha256", getCookieSecret()).update(value).digest("base64url");
  return `${value}.${digest}`;
}

function unsign(signedValue: string): string | null {
  const separator = signedValue.lastIndexOf(".");
  if (separator <= 0) return null;

  const value = signedValue.slice(0, separator);
  const providedDigest = signedValue.slice(separator + 1);
  const expectedDigest = createHmac("sha256", getCookieSecret()).update(value).digest("base64url");

  return providedDigest === expectedDigest ? value : null;
}

function now(): number {
  return Date.now();
}

export async function createOAuthFlowSession(input: Omit<OAuthFlowSession, "createdAt">): Promise<{
  cookieValue: string;
  maxAgeSeconds: number;
}> {
  const id = randomUUID();
  const expiresAt = new Date(now() + OAUTH_FLOW_TTL_MS);
  const createdAt = now();

  await query(
    `INSERT INTO oauth_flow_sessions (id, state, nonce, code_verifier, return_to, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7)`,
    [id, input.state, input.nonce, input.codeVerifier, input.returnTo, createdAt, expiresAt],
  );

  return {
    cookieValue: sign(id),
    maxAgeSeconds: Math.floor(OAUTH_FLOW_TTL_MS / 1000),
  };
}

type OAuthFlowRow = {
  state: string;
  nonce: string;
  code_verifier: string;
  return_to: string;
  created_at: Date;
};

export async function consumeOAuthFlowSession(cookieValue: string | undefined): Promise<OAuthFlowSession | null> {
  if (!cookieValue) return null;

  const decodedId = unsign(cookieValue);
  if (!decodedId) return null;

  const { rows } = await query<OAuthFlowRow>(
    `DELETE FROM oauth_flow_sessions
     WHERE id = $1 AND expires_at > NOW()
     RETURNING state, nonce, code_verifier, return_to, created_at`,
    [decodedId],
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    state: row.state,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    createdAt: row.created_at.getTime(),
    returnTo: row.return_to,
  };
}

export async function createAppSession(userSub: string): Promise<{
  cookieValue: string;
  maxAgeSeconds: number;
}> {
  const id = randomUUID();
  const createdAt = now();
  const expiresAt = new Date(createdAt + APP_SESSION_TTL_MS);

  await query(
    `INSERT INTO app_sessions (id, user_sub, created_at, expires_at)
     VALUES ($1, $2, to_timestamp($3 / 1000.0), $4)`,
    [id, userSub, createdAt, expiresAt],
  );

  return {
    cookieValue: sign(id),
    maxAgeSeconds: Math.floor(APP_SESSION_TTL_MS / 1000),
  };
}

type AppSessionRow = {
  user_sub: string;
  created_at: Date;
  expires_at: Date;
};

export async function getAppSession(cookieValue: string | undefined): Promise<AppSession | null> {
  if (!cookieValue) return null;

  const id = unsign(cookieValue);
  if (!id) return null;

  const { rows } = await query<AppSessionRow>(
    `SELECT user_sub, created_at, expires_at
     FROM app_sessions
     WHERE id = $1 AND expires_at > NOW()`,
    [id],
  );
  if (rows.length === 0) {
    await query(`DELETE FROM app_sessions WHERE id = $1`, [id]);
    return null;
  }

  const row = rows[0];
  return {
    userSub: row.user_sub,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
  };
}

export async function destroyAppSession(cookieValue: string | undefined): Promise<void> {
  if (!cookieValue) return;
  const id = unsign(cookieValue);
  if (!id) return;
  await query(`DELETE FROM app_sessions WHERE id = $1`, [id]);
}

type UserRow = {
  sub: string;
  email: string | null;
  email_verified: boolean | null;
  name: string | null;
  picture: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function upsertGoogleUser(claims: {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}): Promise<UserRecord> {
  const { rows } = await query<UserRow>(
    `INSERT INTO auth_users (sub, email, email_verified, name, picture, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (sub) DO UPDATE
       SET email = EXCLUDED.email,
           email_verified = EXCLUDED.email_verified,
           name = EXCLUDED.name,
           picture = EXCLUDED.picture,
           updated_at = NOW()
     RETURNING sub, email, email_verified, name, picture, created_at, updated_at`,
    [claims.sub, claims.email ?? null, claims.email_verified ?? null, claims.name ?? null, claims.picture ?? null],
  );

  const row = rows[0];
  return {
    sub: row.sub,
    email: row.email ?? undefined,
    emailVerified: row.email_verified ?? undefined,
    name: row.name ?? undefined,
    picture: row.picture ?? undefined,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

export async function getUserBySub(sub: string): Promise<UserRecord | null> {
  const { rows } = await query<UserRow>(
    `SELECT sub, email, email_verified, name, picture, created_at, updated_at
     FROM auth_users
     WHERE sub = $1`,
    [sub],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    sub: row.sub,
    email: row.email ?? undefined,
    emailVerified: row.email_verified ?? undefined,
    name: row.name ?? undefined,
    picture: row.picture ?? undefined,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}
