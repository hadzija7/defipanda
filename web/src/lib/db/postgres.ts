import { Pool } from "pg";
import type { QueryResultRow } from "pg";

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return databaseUrl;
}

function shouldUseSsl(): boolean {
  return process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require";
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", (error) => {
      console.error("Unexpected error on idle PostgreSQL client", error);
    });
  }
  return pool;
}

async function initializeSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_users (
        sub TEXT PRIMARY KEY,
        email TEXT,
        email_verified BOOLEAN,
        name TEXT,
        picture TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_flow_sessions (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        nonce TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        return_to TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id TEXT PRIMARY KEY,
        user_sub TEXT NOT NULL REFERENCES auth_users(sub) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_flow_sessions_expires_at
      ON oauth_flow_sessions (expires_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at
      ON app_sessions (expires_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS smart_account_linkages (
        user_sub TEXT NOT NULL REFERENCES auth_users(sub) ON DELETE CASCADE,
        chain_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        smart_account_address TEXT,
        provisioning_status TEXT NOT NULL DEFAULT 'pending',
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_sub, chain_id, provider)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_smart_account_linkages_user_sub
      ON smart_account_linkages (user_sub);
    `);
  } finally {
    client.release();
  }
}

export async function ensureDatabaseReady(): Promise<void> {
  if (!initPromise) {
    initPromise = initializeSchema().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
}

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }> {
  await ensureDatabaseReady();
  const result = await getPool().query<T>(text, params);
  return { rows: result.rows };
}
