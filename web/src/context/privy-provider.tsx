"use client";

import { type ReactNode, useMemo } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { mainnet } from "viem/chains";
import { activeNetwork } from "@/lib/constants/networks";

const queryClient = new QueryClient();

export default function PrivyProviderRoot({
  children,
}: {
  children: ReactNode;
}) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    throw new Error(
      "NEXT_PUBLIC_PRIVY_APP_ID is required when AUTH_PROVIDER=privy",
    );
  }

  const transportUrl = process.env.NEXT_PUBLIC_PRIVY_RPC_URL;

  // Privy's embedded wallet boots on mainnet (chain 1) before switchChain can
  // fire. wagmi/viem will throw "Unsupported chainId 1" if mainnet is missing
  // from the config. Including it here lets the connector initialise without
  // crashing; the PrivyHome effect then switches to Sepolia immediately.
  const config = useMemo(
    () =>
      createConfig({
        chains: [activeNetwork.chain, mainnet],
        transports: {
          [activeNetwork.chainId]: http(transportUrl),
          [mainnet.id]: http(),
        },
      }),
    [transportUrl],
  );

  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: activeNetwork.chain,
        supportedChains: [activeNetwork.chain, mainnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
