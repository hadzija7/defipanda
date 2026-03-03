"use client";

import {
  useRhinestoneAccount,
  type OnChainBalances,
  type TokenBalance,
} from "@/hooks/useRhinestoneAccount";

export type { OnChainBalances, TokenBalance };

export function useSmartAccount() {
  const rhinestone = useRhinestoneAccount();

  return {
    provider: "reown_appkit" as const,
    ...rhinestone,
  };
}
