import type { Metadata } from "next";
import { headers } from "next/headers";
import { WalletProviderRoot } from "@/context/wallet-provider-root";
import { normalizeRuntimeAuthProvider } from "@/lib/runtime/provider-selection";

export const metadata: Metadata = {
  title: "DefiPanda",
  description: "Manage your automated DCA strategy",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get("cookie");
  const authProvider = normalizeRuntimeAuthProvider(process.env.AUTH_PROVIDER);

  return (
    <WalletProviderRoot cookies={cookies} authProvider={authProvider}>
      {children}
    </WalletProviderRoot>
  );
}
