import { resolveDcaExecutionProvider } from "@/lib/dca/execution-provider";
import type { CREExecutionRequest, ExecutionResponse } from "./types";
import { executeRhinestoneDca } from "./rhinestone";
import { executeZeroDevDca } from "./zerodev";

export async function executeDueDcaPositions(
  body: CREExecutionRequest,
): Promise<ExecutionResponse> {
  const provider = resolveDcaExecutionProvider();

  if (provider === "zerodev") {
    return executeZeroDevDca(body);
  }

  return executeRhinestoneDca(body);
}

