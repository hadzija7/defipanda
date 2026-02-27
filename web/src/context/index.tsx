"use client";

import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState, type Config } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { config, networks, projectId, wagmiAdapter } from "@/config";
import { mainnet } from "@reown/appkit/networks";

const queryClient = new QueryClient();

const metadata = {
  name: "DefiPanda",
  description: "Automated DCA strategy on Chainlink CRE",
  url: typeof window !== "undefined" ? window.location.origin : "https://defipanda.app",
  icons: ["/favicon.ico"],
};

if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks,
    defaultNetwork: mainnet,
    metadata,
    features: {
      analytics: true,
      email: true,
      socials: ["google", "x", "github", "discord", "apple", "facebook", "farcaster"],
      emailShowWallets: true,
    },
    allWallets: "SHOW",
  });
}

export default function AppKitProvider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(config as Config, cookies);

  return (
    <WagmiProvider config={config as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
