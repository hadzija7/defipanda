import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { WalletProviderRoot } from "@/context/wallet-provider-root";
import { normalizeRuntimeAuthProvider } from "@/lib/runtime/provider-selection";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DefiPanda",
  description: "Automated DCA strategy on Chainlink CRE",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersObj = await headers();
  const cookies = headersObj.get("cookie");
  const authProvider = normalizeRuntimeAuthProvider(process.env.AUTH_PROVIDER);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WalletProviderRoot cookies={cookies} authProvider={authProvider}>
          {children}
        </WalletProviderRoot>
      </body>
    </html>
  );
}
