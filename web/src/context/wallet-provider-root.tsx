"use client";

import { createContext, useContext, type ReactNode } from "react";
import AppKitProvider from "@/context";
import PrivyProviderRoot from "@/context/privy-provider";
import {
  isPrivyRuntimeProvider,
  isReownRuntimeProvider,
  type RuntimeAuthProvider,
} from "@/lib/runtime/provider-selection";

type WalletRuntimeContextValue = {
  authProvider: RuntimeAuthProvider;
  isReown: boolean;
  isPrivy: boolean;
};

const WalletRuntimeContext = createContext<WalletRuntimeContextValue>({
  authProvider: "reown_appkit",
  isReown: true,
  isPrivy: false,
});

export function WalletProviderRoot({
  children,
  cookies,
  authProvider,
}: {
  children: ReactNode;
  cookies: string | null;
  authProvider: RuntimeAuthProvider;
}) {
  const runtimeValue: WalletRuntimeContextValue = {
    authProvider,
    isReown: isReownRuntimeProvider(authProvider),
    isPrivy: isPrivyRuntimeProvider(authProvider),
  };

  let content: ReactNode = <>{children}</>;
  if (runtimeValue.isReown) {
    content = <AppKitProvider cookies={cookies}>{children}</AppKitProvider>;
  } else if (runtimeValue.isPrivy) {
    content = <PrivyProviderRoot>{children}</PrivyProviderRoot>;
  }

  return (
    <WalletRuntimeContext.Provider value={runtimeValue}>
      {content}
    </WalletRuntimeContext.Provider>
  );
}

export function useWalletRuntime() {
  return useContext(WalletRuntimeContext);
}
