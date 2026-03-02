export interface CREExecutionRequest {
  consensusPrice: string;
  maxSlippageBps: number;
  executionTimestamp: number;
  triggerTimestamp?: number;
  roundId?: string;
}

export interface ExecutionResult {
  positionId: string;
  user: string;
  amountIn: string;
  txHash: string | null;
  error?: string;
}

export interface ExecutionResponse {
  ok: true;
  executionsTriggered: number;
  results: ExecutionResult[];
}

