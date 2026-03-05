"use client";

import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Hook: useOnboardingStatus
// ---------------------------------------------------------------------------

export function useOnboardingStatus(
  smartAccountAddress: string | undefined,
  provider: string,
) {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!smartAccountAddress) return;

    const localKey = `onboarding_${smartAccountAddress.toLowerCase()}_${provider}`;
    if (typeof window !== "undefined" && localStorage.getItem(localKey) === "done") {
      setChecked(true);
      return;
    }

    fetch(
      `/api/onboarding/status?address=${encodeURIComponent(smartAccountAddress)}&provider=${encodeURIComponent(provider)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.completed) {
          if (typeof window !== "undefined") {
            localStorage.setItem(localKey, "done");
          }
        } else {
          setShow(true);
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [smartAccountAddress, provider]);

  const completeOnboarding = useCallback(async () => {
    if (!smartAccountAddress) return;
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartAccountAddress,
          smartAccountProvider: provider,
        }),
      });
    } catch {
      // best-effort
    }
    const localKey = `onboarding_${smartAccountAddress.toLowerCase()}_${provider}`;
    if (typeof window !== "undefined") {
      localStorage.setItem(localKey, "done");
    }
    setShow(false);
  }, [smartAccountAddress, provider]);

  return { showOnboarding: show, completeOnboarding, checked };
}

// ---------------------------------------------------------------------------
// OnboardingGuide component
// ---------------------------------------------------------------------------

const TOTAL_STEPS = 6;

const FAUCET_URL = "https://faucet.circle.com/";

interface OnboardingGuideProps {
  smartAccountAddress: string;
  smartAccountProvider: string;
  ownerAddress: string;
  onComplete: () => void;
  onPositionCreated?: () => void;
  onActivateStrategy?: () => Promise<void>;
}

export function OnboardingGuide({
  smartAccountAddress,
  smartAccountProvider,
  ownerAddress,
  onComplete,
  onPositionCreated,
  onActivateStrategy,
}: OnboardingGuideProps) {
  const [step, setStep] = useState(0);
  const [actionDone, setActionDone] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNext() {
    setActionDone(false);
    setError(null);
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  }

  function handleSkip() {
    onComplete();
  }

  async function handleCopyAddress() {
    try {
      await navigator.clipboard.writeText(smartAccountAddress);
      setActionDone(true);
      setTimeout(() => handleNext(), 800);
    } catch {
      setError("Failed to copy address");
    }
  }

  function handleOpenFaucet() {
    navigator.clipboard.writeText(smartAccountAddress).catch(() => {});
    window.open(FAUCET_URL, "_blank", "noopener,noreferrer");
    setActionDone(true);
  }

  async function handleCreateStrategy() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/dca/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartAccountAddress,
          smartAccountProvider,
          ownerAddress,
          dcaAmountUsdc: "250000", // 0.25 USDC in smallest units
          intervalSeconds: 300, // 5 minutes
          active: false,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error || "Failed to create strategy");
        return;
      }
      onPositionCreated?.();
      setActionDone(false);
      setStep((s) => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setCreating(false);
    }
  }

  async function handleActivateStrategy() {
    if (!onActivateStrategy) return;
    setActivating(true);
    setError(null);
    try {
      await onActivateStrategy();
      setActionDone(true);
      onPositionCreated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Activation failed";
      const isUserRejection =
        /user rejected|user denied|user cancelled|rejected the request/i.test(msg);
      if (!isUserRejection) {
        setError(msg);
      }
    } finally {
      setActivating(false);
    }
  }

  const steps = [
    {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      title: "Welcome to DefiPanda!",
      subtitle: "What is Dollar-Cost Averaging?",
      body: (
        <>
          <p>
            <strong>Dollar-Cost Averaging (DCA)</strong> is a simple investment strategy where you buy a fixed amount of an asset at regular intervals, regardless of the price.
          </p>
          <p className="mt-2">
            Instead of trying to time the market, DCA spreads your purchases over time. This reduces the impact of volatility and helps you accumulate assets steadily.
          </p>
          <p className="mt-2">
            DefiPanda automates this for you on-chain using <strong>Chainlink CRE</strong>. You set an amount and frequency, and we handle the rest, swapping USDC for ETH on your behalf.
          </p>
        </>
      ),
      action: (
        <button
          onClick={handleNext}
          type="button"
          className="w-full rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md active:scale-[0.98]"
        >
          Got it, let&apos;s go!
        </button>
      ),
    },
    {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: "Your Smart Account",
      subtitle: "A blockchain wallet you control with your login",
      body: (
        <>
          <p>
            We&apos;ve created a <strong>smart account</strong> for you, a programmable on-chain wallet tied to your email/social login. No seed phrases or browser extensions required.
          </p>
          <p className="mt-2">
            This account can execute trades automatically while <strong>you remain in full control</strong>. It supports session keys so only approved actions (your DCA swaps) can run on your behalf.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Your address
            </div>
            <code className="block break-all text-sm font-mono text-zinc-800 dark:text-zinc-200">
              {smartAccountAddress}
            </code>
          </div>
        </>
      ),
      action: actionDone ? (
        <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-6 py-3 text-base font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </div>
      ) : (
        <button
          onClick={handleCopyAddress}
          type="button"
          className="w-full rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md active:scale-[0.98]"
        >
          Copy Address & Continue
        </button>
      ),
    },
    {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      title: "Fund Your Account",
      subtitle: "Get free testnet USDC to start",
      body: (
        <>
          <p>
            To create a DCA strategy you need <strong>testnet USDC</strong>. You can get it for free from the Circle Faucet.
          </p>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              When the faucet opens:
            </p>
            <ol className="mt-1.5 list-inside list-decimal space-y-1 text-sm text-amber-700 dark:text-amber-300">
              <li>Select <strong>Ethereum Sepolia</strong> network</li>
              <li>Paste your smart account address (already copied!)</li>
              <li>Request USDC tokens</li>
              <li>Come back here and continue</li>
            </ol>
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Your address will be automatically copied to the clipboard when you open the faucet.
          </p>
        </>
      ),
      action: actionDone ? (
        <button
          onClick={handleNext}
          type="button"
          className="w-full rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md active:scale-[0.98]"
        >
          I&apos;ve got my USDC, continue
        </button>
      ) : (
        <button
          onClick={handleOpenFaucet}
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md active:scale-[0.98]"
        >
          Open Circle Faucet
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
      ),
    },
    {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
      ),
      title: "Create Your First Strategy",
      subtitle: "Let's set up a sample DCA position",
      body: (
        <>
          <p>
            We&apos;ll create a starter DCA strategy for you. You can customize the amount and interval anytime from the dashboard.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Amount</span>
                <span className="font-medium">0.25 USDC per execution</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Frequency</span>
                <span className="font-medium">Every 5 minutes</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Pair</span>
                <span className="font-medium">USDC → ETH (WETH)</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Network</span>
                <span className="font-medium">Ethereum Sepolia</span>
              </div>
            </div>
          </div>
        </>
      ),
      action: (
        <button
          onClick={handleCreateStrategy}
          disabled={creating}
          type="button"
          className="w-full rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
        >
          {creating ? "Creating..." : "Create Strategy"}
        </button>
      ),
    },
    {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      title: "Authorize Automation",
      subtitle: "Approve DefiPanda to execute trades for you",
      body: (
        <>
          <p>
            To run your DCA strategy automatically, DefiPanda needs your one-time approval. This creates a <strong>session key</strong>, a limited scoped permission that only allows the specific actions in your strategy.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              What you&apos;re approving
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-emerald-500">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Swap USDC for ETH via Uniswap on your behalf</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-emerald-500">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Only within your strategy limits (0.25 USDC per swap)</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-emerald-500">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>You can pause or revoke anytime from the dashboard</span>
              </div>
            </div>
          </div>
          {!actionDone && (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              A wallet popup will appear asking you to sign. This deploys your smart account and enables the session key on-chain.
            </p>
          )}
          {actionDone && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Your DCA strategy is now live! DefiPanda will automatically swap 0.25 USDC for ETH every 5 minutes.
              </p>
            </div>
          )}
        </>
      ),
      action: actionDone ? (
        <button
          onClick={handleNext}
          type="button"
          className="w-full rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-emerald-400 hover:shadow-md active:scale-[0.98]"
        >
          Next
        </button>
      ) : (
        <button
          onClick={handleActivateStrategy}
          disabled={activating || !onActivateStrategy}
          type="button"
          className="w-full rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
        >
          {activating ? "Authorizing..." : "Authorize & Activate"}
        </button>
      ),
    },
    {
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      ),
      title: "Withdraw Anytime",
      subtitle: "Move assets to your own wallet when ready",
      body: (
        <>
          <p>
            Your DCA strategy is running! As it accumulates ETH over time, you can <strong>withdraw your assets</strong> whenever you want to a hardware wallet or any self-custody solution.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              How to withdraw
            </div>
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">1</span>
                <span>Click the <strong>Withdraw</strong> button on the Balances card</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">2</span>
                <span>Choose USDC or WETH and enter the amount</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">3</span>
                <span>Paste your hardware wallet or self-custody address</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">4</span>
                <span>Confirm the withdrawal transaction</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Your smart account is fully non-custodial. Only you can move funds out of it. DefiPanda can only perform the swaps you authorized.
          </p>
        </>
      ),
      action: (
        <button
          onClick={handleNext}
          type="button"
          className="w-full rounded-xl bg-amber-500 px-6 py-3 text-base font-semibold text-white shadow-sm transition-all hover:bg-amber-400 hover:shadow-md active:scale-[0.98]"
        >
          Finish Setup
        </button>
      ),
    },
  ];

  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        style={{ animation: "fade-in-up 0.3s ease-out" }}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                  i < step
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : i === step
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                }`}
              >
                {i < step ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < TOTAL_STEPS - 1 && (
                <div
                  className={`h-0.5 w-6 rounded transition-colors ${
                    i < step
                      ? "bg-emerald-300 dark:bg-emerald-700"
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30">
              {currentStep.icon}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {currentStep.title}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {currentStep.subtitle}
              </p>
            </div>
          </div>

          <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {currentStep.body}
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {currentStep.action}
          <button
            onClick={handleSkip}
            type="button"
            className="mt-2 w-full rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            Skip onboarding
          </button>
        </div>
      </div>
    </div>
  );
}
