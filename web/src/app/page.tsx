"use client";

import { useEffect, useState } from "react";

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

export default function Home() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [authState, setAuthState] = useState<AuthMeResponse | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  async function loadMe() {
    setIsAuthLoading(true);
    try {
      const response = await fetch("/auth/me", { cache: "no-store" });
      const body = (await response.json()) as AuthMeResponse;
      setAuthState(body);
    } catch {
      setAuthState({
        authenticated: false,
        user: null,
        wallet: null,
      });
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    await loadMe();
  }

  useEffect(() => {
    void loadMe();
  }, []);

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
          OAuth Phase 1 is enabled with Google OIDC Authorization Code + PKCE via server routes.
        </p>

        <section className="flex flex-col gap-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-sm font-medium">Authentication</div>
          {authError ? <div className="text-xs text-red-600">Auth error: {authError}</div> : null}
          {isAuthLoading ? <div className="text-sm">Loading auth state...</div> : null}
          {!isAuthLoading && !authState?.authenticated ? (
            <div className="flex items-center gap-3">
              <a
                href="/auth/google/login?returnTo=/"
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Login with Google
              </a>
            </div>
          ) : null}
          {!isAuthLoading && authState?.authenticated ? (
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
        </section>

        {!isAuthLoading && authState?.authenticated && authState.wallet ? (
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

        {!isAuthLoading && authState?.authenticated && !authState.wallet ? (
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
