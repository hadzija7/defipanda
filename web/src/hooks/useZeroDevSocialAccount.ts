"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { createKernelAccount } from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  getSocialValidator,
  initiateLogin,
  isAuthorized,
  logout,
} from "@zerodev/social-validator";
import {
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import { CallPolicyVersion, toCallPolicy } from "@zerodev/permissions/policies";
import { toEmptyECDSASigner } from "@zerodev/permissions/signers";
import { activeNetwork } from "@/lib/constants/networks";
import type { OnChainBalances } from "@/hooks/useRhinestoneAccount";

type ZeroDevSocialProvider = "google" | "facebook";

export interface ZeroDevSocialAccountState {
  accountAddress: string | null;
  onChainBalances: OnChainBalances | null;
  isAuthorized: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useZeroDevSocialAccount() {
  const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
  const socialProvider = (process.env.NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER ||
    "google") as ZeroDevSocialProvider;

  const [state, setState] = useState<ZeroDevSocialAccountState>({
    accountAddress: null,
    onChainBalances: null,
    isAuthorized: false,
    isLoading: false,
    error: null,
  });

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: activeNetwork.chain,
        transport: http(
          process.env.NEXT_PUBLIC_ZERODEV_RPC_URL ||
            process.env.ZERODEV_RPC_URL,
        ),
      }),
    [],
  );

  const fetchOnChainBalances = useCallback(
    async (address?: string) => {
      const accountAddress = address || state.accountAddress;
      if (!accountAddress) {
        return;
      }

      try {
        const [usdcBal, wethBal] = await Promise.all([
          publicClient.readContract({
            address: activeNetwork.usdc,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [accountAddress as `0x${string}`],
          }),
          publicClient.readContract({
            address: activeNetwork.weth,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [accountAddress as `0x${string}`],
          }),
        ]);

        setState((prev) => ({
          ...prev,
          onChainBalances: {
            usdc: formatUnits(usdcBal, activeNetwork.usdcDecimals),
            weth: formatUnits(wethBal, activeNetwork.wethDecimals),
            usdcRaw: usdcBal.toString(),
            wethRaw: wethBal.toString(),
            chainName: activeNetwork.name,
            chainId: activeNetwork.chainId,
          },
        }));
      } catch (error) {
        console.error("Failed to fetch ZeroDev on-chain balances:", error);
      }
    },
    [publicClient, state.accountAddress],
  );

  const refreshAccount = useCallback(async () => {
    if (!projectId) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        isAuthorized: false,
        error:
          "NEXT_PUBLIC_ZERODEV_PROJECT_ID is required when AUTH_PROVIDER=zerodev_social",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const authorized = await isAuthorized({ projectId });

      if (!authorized) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          isAuthorized: false,
          accountAddress: null,
          onChainBalances: null,
        }));
        return;
      }

      const entryPoint = getEntryPoint("0.7");
      const socialValidator = await getSocialValidator(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        projectId,
      });

      const kernelAccount = await createKernelAccount(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: socialValidator,
        },
      });

      setState((prev) => ({
        ...prev,
        isAuthorized: true,
        accountAddress: kernelAccount.address,
        isLoading: false,
      }));

      await fetchOnChainBalances(kernelAccount.address);
    } catch (error) {
      console.error("Failed to initialize ZeroDev social account:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize ZeroDev account",
      }));
    }
  }, [fetchOnChainBalances, projectId, publicClient]);

  const login = useCallback(async () => {
    if (!projectId) {
      setState((prev) => ({
        ...prev,
        error:
          "NEXT_PUBLIC_ZERODEV_PROJECT_ID is required when AUTH_PROVIDER=zerodev_social",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await initiateLogin({
        projectId,
        socialProvider,
        oauthCallbackUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/`
            : undefined,
      });
      await refreshAccount();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to login",
      }));
    }
  }, [projectId, refreshAccount, socialProvider]);

  const disconnect = useCallback(async () => {
    if (!projectId) {
      return;
    }

    try {
      await logout({ projectId });
    } catch (error) {
      console.error("ZeroDev logout failed:", error);
    }

    setState({
      accountAddress: null,
      onChainBalances: null,
      isAuthorized: false,
      isLoading: false,
      error: null,
    });
  }, [projectId]);

  const preparePermissionAccount = useCallback(
    async (sessionSignerAddress: `0x${string}`): Promise<string> => {
      if (!projectId) {
        throw new Error("NEXT_PUBLIC_ZERODEV_PROJECT_ID is not configured");
      }

      if (!state.accountAddress) {
        throw new Error("ZeroDev smart account not initialized");
      }

      const entryPoint = getEntryPoint("0.7");
      const socialValidator = await getSocialValidator(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        projectId,
      });

      const permissionSigner = toEmptyECDSASigner(sessionSignerAddress);
      const approveSelector = toFunctionSelector("approve(address,uint256)");
      const swapSelector = toFunctionSelector(
        "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))",
      );

      const callPolicy = toCallPolicy({
        policyVersion: CallPolicyVersion.V0_0_5,
        permissions: [
          {
            target: activeNetwork.usdc,
            selector: approveSelector,
            valueLimit: BigInt(0),
          },
          {
            target: activeNetwork.uniswapV3SwapRouter02,
            selector: swapSelector,
            valueLimit: BigInt(0),
          },
          {
            // Native transfer value should stay zero for DCA swaps.
            target: zeroAddress,
            valueLimit: BigInt(0),
          },
        ],
      });

      const permissionPlugin = await toPermissionValidator(publicClient, {
        signer: permissionSigner,
        policies: [callPolicy],
        entryPoint,
        kernelVersion: KERNEL_V3_1,
      });

      const account = await createKernelAccount(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        address: state.accountAddress as `0x${string}`,
        plugins: {
          sudo: socialValidator,
          regular: permissionPlugin,
        },
      });

      const enableSignature =
        await account.kernelPluginManager.getPluginEnableSignature(
          state.accountAddress as `0x${string}`,
          permissionPlugin,
        );

      return serializePermissionAccount(
        account,
        undefined,
        enableSignature,
        undefined,
        permissionPlugin,
      );
    },
    [projectId, publicClient, state.accountAddress],
  );

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  return {
    ...state,
    login,
    disconnect,
    refreshAccount,
    refreshOnChainBalances: fetchOnChainBalances,
    preparePermissionAccount,
  };
}
