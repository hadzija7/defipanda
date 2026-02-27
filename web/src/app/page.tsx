"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { useAccount } from "wagmi";
import { useRhinestoneAccount } from "@/hooks/useRhinestoneAccount";

type SimulationResponse = {
  ok: boolean;
  command?: string;
  cwd?: string;
  exitCode?: number | null;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type WalletStatus = {
  status: "pending" | "ready" | "failed";
  address: string | null;
  chainId: string;
  provider: string;
  error: string | null;
};

type AuthMeResponse = {
  authProvider: "google_oidc" | "zerodev_social" | "walletconnect" | "reown_appkit";
  authenticated: boolean;
  user: {
    sub: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    picture?: string;
  } | null;
  wallet: WalletStatus | null;
};

type AuthProviderCapabilities = {
  serverSession: boolean;
  clientSideLogin: boolean;
  smartAccountProvisioning: boolean;
  unifiedWalletAuth: boolean;
};

type AuthProviderResponse = {
  provider: "google_oidc" | "zerodev_social" | "walletconnect" | "reown_appkit";
  displayName: string;
  capabilities: AuthProviderCapabilities;
};

type ClientWalletInfo = {
  address: string;
  chainId: number;
};

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [authState, setAuthState] = useState<AuthMeResponse | null>(null);
  const [authProvider, setAuthProvider] = useState<AuthProviderResponse | null>(null);
  const [socialAuthorized, setSocialAuthorized] = useState(false);
  const [clientWallet, setClientWallet] = useState<ClientWalletInfo | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const appKitAccount = useAppKitAccount();
  const wagmiAccount = useAccount();
  const { disconnect } = useDisconnect();
  const {
    accountAddress: rhinestoneAddress,
    portfolio: rhinestonePortfolio,
    isLoading: rhinestoneLoading,
    error: rhinestoneError,
    refreshPortfolio,
  } = useRhinestoneAccount();

  const isReownProvider = authProvider?.provider === "reown_appkit";
  const isAppKitConnected = appKitAccount.isConnected && !!appKitAccount.address;

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "unknown_error";
  }

  async function loadAuthProvider() {
    try {
      const response = await fetch("/auth/provider", { cache: "no-store" });
      const body = (await response.json()) as AuthProviderResponse;
      setAuthProvider(body);
      return body;
    } catch {
      const fallback: AuthProviderResponse = {
        provider: "google_oidc",
        displayName: "Google OAuth",
        capabilities: { serverSession: true, clientSideLogin: false, smartAccountProvisioning: true, unifiedWalletAuth: false },
      };
      setAuthProvider(fallback);
      return fallback;
    }
  }

  async function loadMe() {
    try {
      const response = await fetch("/auth/me", { cache: "no-store" });
      const body = (await response.json()) as AuthMeResponse;
      setAuthState(body);
    } catch {
      setAuthState({
        authProvider: "google_oidc",
        authenticated: false,
        user: null,
        wallet: null,
      });
    }
  }

  const loadSocialAuthStatus = useCallback(async () => {
    if (isReownProvider) {
      setSocialAuthorized(isAppKitConnected);
      if (isAppKitConnected && appKitAccount.address) {
        const chainIdStr = process.env.NEXT_PUBLIC_APPKIT_CHAIN_ID || "1";
        const chainId = parseInt(chainIdStr, 10);
        setClientWallet({ address: appKitAccount.address, chainId: wagmiAccount.chainId ?? chainId });
      } else {
        setClientWallet(null);
      }
      return;
    }

    if (!authProvider?.capabilities.clientSideLogin) {
      setSocialAuthorized(false);
      setClientWallet(null);
      return;
    }

    if (authProvider?.provider === "zerodev_social") {
      try {
        const sdk = await import("@zerodev/social-validator");
        const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
        if (!projectId) {
          setSocialAuthorized(false);
          setClientWallet(null);
          return;
        }
        const authorized = await sdk.isAuthorized({ projectId });
        setSocialAuthorized(authorized);

        if (authorized && authProvider.capabilities.unifiedWalletAuth) {
          const chainIdStr = process.env.NEXT_PUBLIC_ZERODEV_CHAIN_ID || "1";
          const chainId = parseInt(chainIdStr, 10);
          setClientWallet({ address: "pending", chainId });
        } else {
          setClientWallet(null);
        }
      } catch {
        setSocialAuthorized(false);
        setClientWallet(null);
      }
    } else {
      setSocialAuthorized(false);
      setClientWallet(null);
    }
  }, [
    isReownProvider, isAppKitConnected, appKitAccount.address, wagmiAccount.chainId,
    authProvider?.provider, authProvider?.capabilities.clientSideLogin, authProvider?.capabilities.unifiedWalletAuth,
  ]);

  async function login() {
    if (isReownProvider) {
      return;
    }

    if (authProvider?.capabilities.clientSideLogin) {
      if (authProvider?.provider === "zerodev_social") {
        const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
        if (!projectId) {
          setAuthError("missing_zerodev_project_id");
          return;
        }

        try {
          const sdk = await import("@zerodev/social-validator");
          const oauthCallbackUrl = `${window.location.origin}/`;
          await sdk.initiateLogin({
            socialProvider: (process.env.NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER as "google" | "facebook") || "google",
            oauthCallbackUrl,
            projectId,
          });
        } catch (error) {
          const message = getErrorMessage(error);
          console.error("ZeroDev social login failed:", {
            message,
            projectId,
            socialProvider: process.env.NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER || "google",
          });
          setAuthError(`zerodev_social_login_failed:${message}`);
        }
        return;
      }

      setAuthError("client_login_not_implemented");
      return;
    }

    window.location.href = "/auth/login?returnTo=/";
  }

  async function logout() {
    if (isReownProvider) {
      disconnect();
      setSocialAuthorized(false);
      setClientWallet(null);
      return;
    }

    if (authProvider?.capabilities.clientSideLogin) {
      if (authProvider?.provider === "zerodev_social") {
        const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
        if (projectId) {
          try {
            const sdk = await import("@zerodev/social-validator");
            await sdk.logout({ projectId });
          } catch {
            // Best effort; still clear app session below.
          }
        }
      }
    }

    await fetch("/auth/logout", { method: "POST" });
    await Promise.all([loadMe(), loadSocialAuthStatus()]);
  }

  useEffect(() => {
    void (async () => {
      setIsAuthLoading(true);
      await loadAuthProvider();
      await loadMe();
      setIsAuthLoading(false);
    })();
  }, []);

  useEffect(() => {
    void loadSocialAuthStatus();
  }, [loadSocialAuthStatus]);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("authError");
    setAuthError(value);
  }, []);

  async function runSimulation() {
    setIsRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/cre/simulate", { method: "POST" });
      const body = (await response.json()) as SimulationResponse;
      setResult(body);
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown request error",
      });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold">DefiPanda Local Flow Test</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {isReownProvider
            ? "Reown AppKit is active. Connect via social login, email, or any WalletConnect wallet."
            : "OAuth Phase 1 is enabled with Google OIDC Authorization Code + PKCE via server routes."}
        </p>

        <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-medium">Authentication</div>
          {authError ? <div className="text-xs text-red-600">Auth error: {authError}</div> : null}
          {isAuthLoading ? <div className="text-sm">Loading auth state...</div> : null}

          {!isAuthLoading && isReownProvider ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <appkit-button />
              </div>
              {isAppKitConnected && appKitAccount.address ? (
                <div className="flex flex-col gap-2 text-sm">
                  <div>
                    Connected as{" "}
                    <code className="break-all rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">
                      {appKitAccount.address}
                    </code>
                  </div>
                  {wagmiAccount.chainId ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Chain ID: {wagmiAccount.chainId}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {!isAuthLoading && !isReownProvider && !authState?.authenticated && !socialAuthorized ? (
            <div className="flex items-center gap-3">
              <button
                onClick={login}
                type="button"
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Login with {authProvider?.displayName ?? "Google"}
              </button>
            </div>
          ) : null}
          {!isAuthLoading && !isReownProvider && authState?.authenticated ? (
            <div className="flex flex-col gap-2 text-sm">
              <div>
                Signed in as{" "}
                <span className="font-medium">{authState.user?.email ?? authState.user?.sub ?? "unknown"}</span>
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Subject: <code>{authState.user?.sub}</code>
              </div>
              <div className="flex items-center gap-3">
                <button
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  onClick={logout}
                  type="button"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
          {!isAuthLoading && !isReownProvider && !authState?.authenticated && socialAuthorized ? (
            <div className="flex flex-col gap-2 text-sm">
              <div>
                {authProvider?.displayName ?? "Client"} session is active.
              </div>
              {authProvider?.capabilities.unifiedWalletAuth ? (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  This provider manages both authentication and your smart account wallet in one unified flow.
                </div>
              ) : (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Backend app session is not created in client-side auth mode. Switch to a server-session provider
                  (e.g. <code>AUTH_PROVIDER=google_oidc</code>) for server-side sessions.
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  onClick={logout}
                  type="button"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {!isAuthLoading && isReownProvider && isAppKitConnected && clientWallet ? (
          <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm font-medium">Wallet (Reown AppKit)</div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Connected via Reown AppKit</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Connected Address (EOA / Embedded Wallet)</div>
              <code className="break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
                {clientWallet.address}
              </code>
            </div>
            <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Chain: {clientWallet.chainId}</span>
              <span>Provider: reown_appkit</span>
            </div>
          </section>
        ) : null}

        {!isAuthLoading && isReownProvider && isAppKitConnected ? (
          <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm font-medium">Smart Account (Rhinestone)</div>
            {rhinestoneLoading ? (
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Initializing Rhinestone account...</span>
              </div>
            ) : rhinestoneError ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Rhinestone account error</span>
                </div>
                <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                  {rhinestoneError}
                </div>
              </div>
            ) : rhinestoneAddress ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">ERC-7579 account (same address on all chains)</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Smart Account Address</div>
                  <code className="break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
                    {rhinestoneAddress}
                  </code>
                </div>

                {rhinestonePortfolio.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cross-Chain Portfolio</div>
                      <button
                        onClick={refreshPortfolio}
                        type="button"
                        className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      >
                        Refresh
                      </button>
                    </div>
                    {rhinestonePortfolio.map((token) => (
                      <div key={token.symbol} className="rounded border border-zinc-100 p-2 dark:border-zinc-800">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{token.symbol}</span>
                          <span>{token.totalBalance}</span>
                        </div>
                        {token.chains.length > 0 ? (
                          <div className="mt-1 flex flex-col gap-0.5">
                            {token.chains.map((chain) => (
                              <div key={chain.chainId} className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
                                <span>{chain.chainName}</span>
                                <span>{chain.formattedBalance}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-400 dark:text-zinc-500">
                    No cross-chain balances found. Fund your smart account to see balances here.
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isAuthLoading && !isReownProvider && authState?.authenticated && authState.wallet ? (
          <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm font-medium">Smart Account</div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  authState.wallet.status === "ready"
                    ? "bg-emerald-500"
                    : authState.wallet.status === "failed"
                      ? "bg-red-500"
                      : "bg-amber-500"
                }`}
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {authState.wallet.status === "ready"
                  ? "Provisioned"
                  : authState.wallet.status === "failed"
                    ? "Provisioning failed"
                    : "Provisioning..."}
              </span>
            </div>
            {authState.wallet.address ? (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Address</div>
                <code className="break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
                  {authState.wallet.address}
                </code>
              </div>
            ) : null}
            <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Chain: {authState.wallet.chainId}</span>
              <span>Provider: {authState.wallet.provider}</span>
            </div>
            {authState.wallet.error ? (
              <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                {authState.wallet.error}
              </div>
            ) : null}
          </section>
        ) : null}

        {!isAuthLoading && !isReownProvider && socialAuthorized && clientWallet ? (
          <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm font-medium">Smart Account (Unified)</div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Connected via {authProvider?.displayName}</span>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Smart account is managed by the auth provider. The wallet address will be computed when needed for transactions.
            </div>
            <div className="flex gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Chain: {clientWallet.chainId}</span>
              <span>Provider: {authProvider?.provider}</span>
            </div>
          </section>
        ) : null}

        {!isAuthLoading && !isReownProvider && authState?.authenticated && !authState.wallet ? (
          <section className="flex flex-col gap-2 rounded-md border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <div className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Smart Account</div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500">
              Provisioning not enabled. Set <code>ENABLE_SMART_ACCOUNT_PROVISIONING=true</code> to activate.
            </div>
          </section>
        ) : null}

        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Frontend -&gt; Next.js API route -&gt; CRE CLI simulation. This runs{" "}
          <code>cre workflow simulate dca-workflow --target staging-settings --non-interactive --trigger-index 0</code>{" "}
          from the <code>cre/</code> directory.
        </p>

        <div className="flex items-center gap-3">
          <button
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            onClick={runSimulation}
            disabled={isRunning}
            type="button"
          >
            {isRunning ? "Running simulation..." : "Run CRE simulation"}
          </button>
        </div>

        {result ? (
          <section className="flex flex-col gap-3">
            <div className="text-sm">
              Status:{" "}
              <span className={result.ok ? "text-emerald-600" : "text-red-600"}>
                {result.ok ? "success" : "failed"}
              </span>
            </div>

            {result.command ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Command: <code>{result.command}</code>
              </div>
            ) : null}

            {result.cwd ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Working directory: <code>{result.cwd}</code>
              </div>
            ) : null}

            {typeof result.durationMs === "number" ? (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Duration: {result.durationMs} ms
              </div>
            ) : null}

            {result.stdout ? (
              <div>
                <h2 className="mb-1 text-sm font-medium">stdout</h2>
                <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
                  {result.stdout}
                </pre>
              </div>
            ) : null}

            {result.stderr || result.error ? (
              <div>
                <h2 className="mb-1 text-sm font-medium">stderr / error</h2>
                <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
                  {result.stderr ?? result.error}
                </pre>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
