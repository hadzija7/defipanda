import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, baseSepolia } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, baseSepolia];

export const wagmiAdapter = projectId
  ? new WagmiAdapter({
      storage: createStorage({ storage: cookieStorage }),
      ssr: true,
      projectId,
      networks,
    })
  : null;

export const config = wagmiAdapter?.wagmiConfig;
