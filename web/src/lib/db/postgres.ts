import { Pool } from "pg";
import type { PoolConfig, QueryResultRow } from "pg";

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

function buildPoolConfig(): PoolConfig {
  const ssl = (process.env.DATABASE_SSL === "true" || process.env.PGSSLMODE === "require")
    ? { rejectUnauthorized: false }
    : undefined;

  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl };
  }

  const host = process.env.POSTGRES_HOST;
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;
  if (host && user && password && database) {
    return {
      host,
      port: Number(process.env.POSTGRES_PORT || "5432"),
      user,
      password,
      database,
      ssl,
    };
  }

  throw new Error(
    "Database not configured. Set DATABASE_URL or the individual POSTGRES_HOST/USER/PASSWORD/DB vars.",
  );
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS dca_positions (
        id TEXT PRIMARY KEY,
        smart_account_address TEXT NOT NULL,
        smart_account_provider TEXT NOT NULL DEFAULT 'reown_appkit',
        owner_address TEXT NOT NULL,
        amount_usdc TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL,
        active BOOLEAN NOT NULL DEFAULT true,
        last_executed_at TIMESTAMPTZ,
        last_execution_tx_hash TEXT,
        last_execution_error TEXT,
        total_executions INTEGER NOT NULL DEFAULT 0,
        session_enable_signature TEXT,
        session_hashes_and_chain_ids TEXT,
        zerodev_permission_account TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$ BEGIN
        ALTER TABLE dca_positions ADD COLUMN IF NOT EXISTS session_enable_signature TEXT;
        ALTER TABLE dca_positions ADD COLUMN IF NOT EXISTS session_hashes_and_chain_ids TEXT;
        ALTER TABLE dca_positions ADD COLUMN IF NOT EXISTS smart_account_provider TEXT;
        ALTER TABLE dca_positions ADD COLUMN IF NOT EXISTS zerodev_permission_account TEXT;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);

    await client.query(`
      UPDATE dca_positions
      SET smart_account_provider = 'reown_appkit'
      WHERE smart_account_provider IS NULL OR smart_account_provider = '';
    `);

    await client.query(`
      ALTER TABLE dca_positions
      ALTER COLUMN smart_account_provider SET DEFAULT 'reown_appkit';
    `);

    await client.query(`
      ALTER TABLE dca_positions
      ALTER COLUMN smart_account_provider SET NOT NULL;
    `);

    await client.query(`
      DROP INDEX IF EXISTS idx_dca_positions_smart_account;
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dca_positions_smart_account_provider
      ON dca_positions (smart_account_address, smart_account_provider);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_dca_positions_active
      ON dca_positions (active) WHERE active = true;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_onboarding (
        smart_account_address TEXT NOT NULL,
        smart_account_provider TEXT NOT NULL DEFAULT 'reown_appkit',
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (smart_account_address, smart_account_provider)
      );
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
