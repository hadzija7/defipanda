"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { RhinestoneSDK, walletClientToAccount } from "@rhinestone/sdk";
import { formatUnits } from "viem";

export interface TokenBalance {
  symbol: string;
  totalBalance: string;
  lockedBalance: string;
  unlockedBalance: string;
  decimals: number;
  chains: Array<{
    chainId: number;
    chainName: string;
    balance: string;
    formattedBalance: string;
    lockedBalance: string;
    unlockedBalance: string;
    formattedLockedBalance: string;
    formattedUnlockedBalance: string;
  }>;
}

export interface RhinestoneAccountState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rhinestoneAccount: any | null;
  accountAddress: string | null;
  portfolio: TokenBalance[];
  isLoading: boolean;
  error: string | null;
}

const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  84532: "Base Sepolia",
  11155111: "Sepolia",
  11155420: "Optimism Sepolia",
  421614: "Arbitrum Sepolia",
};

function getChainName(chainId: number): string {
  return CHAIN_NAMES[chainId] || `Chain ${chainId}`;
}

export function useRhinestoneAccount() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<RhinestoneAccountState>({
    rhinestoneAccount: null,
    accountAddress: null,
    portfolio: [],
    isLoading: false,
    error: null,
  });

  const fetchPortfolio = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (account?: any) => {
      const rhinestoneAccount = account || state.rhinestoneAccount;
      if (!rhinestoneAccount) return;

      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        const portfolio = await rhinestoneAccount.getPortfolio();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedPortfolio: TokenBalance[] = portfolio
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((token: any) => {
            const totalLocked = BigInt(token.balances?.locked || 0);
            const totalUnlocked = BigInt(token.balances?.unlocked || 0);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chains = (token.chains || [])
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .map((chain: any) => {
                const chainLocked = BigInt(chain.locked || 0);
                const chainUnlocked = BigInt(chain.unlocked || 0);
                return {
                  chainId: chain.chain,
                  chainName: getChainName(chain.chain),
                  balance: chainUnlocked.toString(),
                  formattedBalance: formatUnits(chainUnlocked, token.decimals),
                  lockedBalance: chainLocked.toString(),
                  unlockedBalance: chainUnlocked.toString(),
                  formattedLockedBalance: formatUnits(chainLocked, token.decimals),
                  formattedUnlockedBalance: formatUnits(chainUnlocked, token.decimals),
                };
              })
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .filter((c: any) =>
                BigInt(c.balance) > BigInt(0) || BigInt(c.lockedBalance) > BigInt(0),
              );

            return {
              symbol: token.symbol,
              totalBalance: formatUnits(totalUnlocked, token.decimals),
              lockedBalance: formatUnits(totalLocked, token.decimals),
              unlockedBalance: formatUnits(totalUnlocked, token.decimals),
              decimals: token.decimals,
              chains,
              _hasBalance: totalUnlocked > BigInt(0) || totalLocked > BigInt(0) || chains.length > 0,
            };
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((token: any) => token._hasBalance)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(({ _hasBalance, ...token }: any) => token);

        setState((prev) => ({
          ...prev,
          portfolio: formattedPortfolio,
          isLoading: false,
        }));
      } catch (error) {
        console.error("Failed to fetch portfolio:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Failed to fetch portfolio",
        }));
      }
    },
    [state.rhinestoneAccount],
  );

  const initializeRhinestoneAccount = useCallback(async () => {
    if (!isConnected || !address || !walletClient) {
      setState((prev) => ({
        ...prev,
        rhinestoneAccount: null,
        accountAddress: null,
        portfolio: [],
        error: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const wrappedWalletClient = walletClientToAccount(walletClient);

      const baseUrl =
        typeof window !== "undefined"
          ? window.location.origin
          : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const rhinestone = new RhinestoneSDK({
        apiKey: "proxy",
        endpointUrl: `${baseUrl}/api/orchestrator`,
      });

      const rhinestoneAccount = await rhinestone.createAccount({
        owners: {
          type: "ecdsa" as const,
          accounts: [wrappedWalletClient],
        },
        experimental_sessions: { enabled: true },
      });

      const accountAddress = rhinestoneAccount.getAddress();

      setState((prev) => ({
        ...prev,
        rhinestoneAccount,
        accountAddress,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Failed to initialize Rhinestone account:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to initialize account",
      }));
    }
  }, [isConnected, address, walletClient]);

  useEffect(() => {
    initializeRhinestoneAccount();
  }, [initializeRhinestoneAccount]);

  useEffect(() => {
    if (state.rhinestoneAccount) {
      fetchPortfolio();
    }
  }, [state.rhinestoneAccount, fetchPortfolio]);

  return {
    ...state,
    refreshPortfolio: () => fetchPortfolio(),
  };
}
