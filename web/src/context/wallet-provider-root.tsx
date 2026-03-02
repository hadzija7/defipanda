"use client";

import { createContext, useContext, type ReactNode } from "react";
import AppKitProvider from "@/context";
import {
  isReownRuntimeProvider,
  type RuntimeAuthProvider,
} from "@/lib/runtime/provider-selection";

type WalletRuntimeContextValue = {
  authProvider: RuntimeAuthProvider;
  isReown: boolean;
};

const WalletRuntimeContext = createContext<WalletRuntimeContextValue>({
  authProvider: "reown_appkit",
  isReown: true,
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
  };

  const content = runtimeValue.isReown ? (
    <AppKitProvider cookies={cookies}>{children}</AppKitProvider>
  ) : (
    <>{children}</>
  );

  return (
    <WalletRuntimeContext.Provider value={runtimeValue}>
      {content}
    </WalletRuntimeContext.Provider>
  );
}

export function useWalletRuntime() {
  return useContext(WalletRuntimeContext);
}
