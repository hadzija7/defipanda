import { randomUUID } from "node:crypto";
import { query } from "@/lib/db/postgres";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DcaPosition = {
  id: string;
  smartAccountAddress: string;
  ownerAddress: string;
  amountUsdc: string;
  intervalSeconds: number;
  active: boolean;
  lastExecutedAt: number | null;
  lastExecutionTxHash: string | null;
  lastExecutionError: string | null;
  totalExecutions: number;
  sessionEnableSignature: string | null;
  sessionHashesAndChainIds: string | null;
  sessionGranted: boolean;
  createdAt: number;
  updatedAt: number;
};

type DcaPositionRow = {
  id: string;
  smart_account_address: string;
  owner_address: string;
  amount_usdc: string;
  interval_seconds: number;
  active: boolean;
  last_executed_at: Date | null;
  last_execution_tx_hash: string | null;
  last_execution_error: string | null;
  total_executions: number;
  session_enable_signature: string | null;
  session_hashes_and_chain_ids: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToPosition(row: DcaPositionRow): DcaPosition {
  return {
    id: row.id,
    smartAccountAddress: row.smart_account_address,
    ownerAddress: row.owner_address,
    amountUsdc: row.amount_usdc,
    intervalSeconds: row.interval_seconds,
    active: row.active,
    lastExecutedAt: row.last_executed_at?.getTime() ?? null,
    lastExecutionTxHash: row.last_execution_tx_hash,
    lastExecutionError: row.last_execution_error,
    totalExecutions: row.total_executions,
    sessionEnableSignature: row.session_enable_signature,
    sessionHashesAndChainIds: row.session_hashes_and_chain_ids,
    sessionGranted: !!(row.session_enable_signature && row.session_hashes_and_chain_ids),
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

const SELECT_COLS = `id, smart_account_address, owner_address, amount_usdc,
  interval_seconds, active, last_executed_at, last_execution_tx_hash,
  last_execution_error, total_executions, session_enable_signature,
  session_hashes_and_chain_ids, created_at, updated_at`;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getPositionBySmartAccount(
  smartAccountAddress: string,
): Promise<DcaPosition | null> {
  const { rows } = await query<DcaPositionRow>(
    `SELECT ${SELECT_COLS} FROM dca_positions
     WHERE smart_account_address = $1`,
    [smartAccountAddress.toLowerCase()],
  );
  return rows.length > 0 ? rowToPosition(rows[0]) : null;
}

export async function getPositionsByOwner(
  ownerAddress: string,
): Promise<DcaPosition[]> {
  const { rows } = await query<DcaPositionRow>(
    `SELECT ${SELECT_COLS} FROM dca_positions
     WHERE owner_address = $1
     ORDER BY created_at DESC`,
    [ownerAddress.toLowerCase()],
  );
  return rows.map(rowToPosition);
}

export async function getDuePositions(): Promise<DcaPosition[]> {
  const { rows } = await query<DcaPositionRow>(
    `SELECT ${SELECT_COLS} FROM dca_positions
     WHERE active = true
       AND (
         last_executed_at IS NULL
         OR EXTRACT(EPOCH FROM (NOW() - last_executed_at)) >= interval_seconds
       )
     ORDER BY last_executed_at ASC NULLS FIRST`,
    [],
  );
  return rows.map(rowToPosition);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function upsertPosition(input: {
  smartAccountAddress: string;
  ownerAddress: string;
  amountUsdc: string;
  intervalSeconds: number;
  active: boolean;
  sessionEnableSignature?: string | null;
  sessionHashesAndChainIds?: string | null;
}): Promise<DcaPosition> {
  const id = randomUUID();
  const { rows } = await query<DcaPositionRow>(
    `INSERT INTO dca_positions (id, smart_account_address, owner_address, amount_usdc,
       interval_seconds, active, session_enable_signature, session_hashes_and_chain_ids, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (smart_account_address) DO UPDATE
       SET amount_usdc = EXCLUDED.amount_usdc,
           interval_seconds = EXCLUDED.interval_seconds,
           active = EXCLUDED.active,
           owner_address = EXCLUDED.owner_address,
           session_enable_signature = COALESCE(EXCLUDED.session_enable_signature, dca_positions.session_enable_signature),
           session_hashes_and_chain_ids = COALESCE(EXCLUDED.session_hashes_and_chain_ids, dca_positions.session_hashes_and_chain_ids),
           updated_at = NOW()
     RETURNING ${SELECT_COLS}`,
    [
      id,
      input.smartAccountAddress.toLowerCase(),
      input.ownerAddress.toLowerCase(),
      input.amountUsdc,
      input.intervalSeconds,
      input.active,
      input.sessionEnableSignature ?? null,
      input.sessionHashesAndChainIds ?? null,
    ],
  );
  return rowToPosition(rows[0]);
}

export async function markExecuted(
  positionId: string,
  txHash: string | null,
  error: string | null,
): Promise<DcaPosition> {
  const { rows } = await query<DcaPositionRow>(
    `UPDATE dca_positions
     SET last_executed_at = NOW(),
         last_execution_tx_hash = $2,
         last_execution_error = $3,
         total_executions = total_executions + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${SELECT_COLS}`,
    [positionId, txHash, error],
  );
  if (rows.length === 0) {
    throw new Error(`DCA position not found: ${positionId}`);
  }
  return rowToPosition(rows[0]);
}

export async function deactivatePosition(
  smartAccountAddress: string,
): Promise<DcaPosition | null> {
  const { rows } = await query<DcaPositionRow>(
    `UPDATE dca_positions
     SET active = false, updated_at = NOW()
     WHERE smart_account_address = $1
     RETURNING ${SELECT_COLS}`,
    [smartAccountAddress.toLowerCase()],
  );
  return rows.length > 0 ? rowToPosition(rows[0]) : null;
}
