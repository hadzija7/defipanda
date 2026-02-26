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

type AuthMeResponse = {
  authenticated: boolean;
  user: {
    sub: string;
    email?: string;
    emailVerified?: boolean;
    name?: string;
    picture?: string;
  } | null;
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
