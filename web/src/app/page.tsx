"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useAccount, useSwitchChain } from "wagmi";
import { useRhinestoneAccount, type TokenBalance, type OnChainBalances } from "@/hooks/useRhinestoneAccount";
import { buildDcaSession } from "@/lib/wallet/rhinestone-sessions";
import type { Address, Hex } from "viem";
import { activeNetwork } from "@/lib/constants/networks";

// ---------------------------------------------------------------------------
// Types (matches DcaPosition from backend)
// ---------------------------------------------------------------------------

interface DcaPosition {
  id: string;
  smartAccountAddress: string;
  ownerAddress: string;
  amountUsdc: string;
  intervalSeconds: number;
  active: boolean;
  lastExecutedAt: number | null;
  lastExecutionTxHash: string | null;
  lastExecutionError: string | null;
  totalExecutions: number;
  sessionGranted: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDC_DECIMALS = 6;

const DCA_INTERVALS = [
  { label: "Every 30 seconds", seconds: 30 },
  { label: "Every 5 minutes", seconds: 300 },
  { label: "Every hour", seconds: 3600 },
  { label: "Every 4 hours", seconds: 14400 },
  { label: "Every day", seconds: 86400 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUsdc(smallestUnit: string): string {
  const n = Number(smallestUnit);
  if (isNaN(n)) return "0";
  return (n / 10 ** USDC_DECIMALS).toFixed(2);
}

function usdcToSmallest(usdcAmount: string): string {
  const n = parseFloat(usdcAmount);
  if (isNaN(n) || n <= 0) return "0";
  return Math.round(n * 10 ** USDC_DECIMALS).toString();
}

function formatInterval(seconds: number): string {
  const match = DCA_INTERVALS.find((i) => i.seconds === seconds);
  if (match) return match.label;
  if (seconds < 60) return `Every ${seconds}s`;
  if (seconds < 3600) return `Every ${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `Every ${Math.round(seconds / 3600)} hours`;
  return `Every ${Math.round(seconds / 86400)} days`;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function StatusDot({ color }: { color: "green" | "amber" | "red" }) {
  const colors = {
    green: "bg-emerald-500",
    amber: "bg-amber-500 animate-pulse",
    red: "bg-red-500",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[color]}`} />;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{children}</h2>;
}

// ---------------------------------------------------------------------------
// Portfolio display
// ---------------------------------------------------------------------------

function OnChainBalancesView({
  balances,
  onRefresh,
}: {
  balances: OnChainBalances | null;
  onRefresh: () => void;
}) {
  if (!balances) {
    return (
      <div className="flex items-center gap-2 py-4">
        <StatusDot color="amber" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Loading balances...</span>
      </div>
    );
  }

  const usdcNum = parseFloat(balances.usdc);
  const wethNum = parseFloat(balances.weth);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {balances.chainName} balances
        </span>
        <button
          onClick={onRefresh}
          type="button"
          className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">USDC</span>
          <span className={`text-sm font-medium ${usdcNum === 0 ? "text-red-500" : ""}`}>
            {usdcNum.toFixed(2)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">DCA input token</div>
      </div>

      <div className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">WETH</span>
          <span className="text-sm font-medium">
            {wethNum < 0.0001 && wethNum > 0 ? "<0.0001" : wethNum.toFixed(6)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">DCA output token</div>
      </div>

      {usdcNum === 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
          No USDC balance. Deposit USDC to start DCA executions.
        </div>
      )}
    </div>
  );
}

function PortfolioView({
  portfolio,
  onRefresh,
}: {
  portfolio: TokenBalance[];
  onRefresh: () => void;
}) {
  if (portfolio.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cross-chain overview</span>
        <button onClick={onRefresh} type="button" className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
          Refresh
        </button>
      </div>
      {portfolio.map((token) => (
        <div key={token.symbol} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{token.symbol}</span>
            <span className="text-sm font-medium">{token.totalBalance}</span>
          </div>
          {token.chains.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              {token.chains.map((chain) => (
                <div key={chain.chainId} className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500">
                  <span>{chain.chainName}</span>
                  <span>{chain.formattedBalance}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DCA Strategy form + status
// ---------------------------------------------------------------------------

function DcaStrategyForm({
  smartAccountAddress,
  ownerAddress,
  existingPosition,
  onSaved,
  usdcBalance,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rhinestoneAccount,
}: {
  smartAccountAddress: string;
  ownerAddress: string;
  existingPosition: DcaPosition | null;
  onSaved: (position: DcaPosition) => void;
  usdcBalance: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rhinestoneAccount: any;
}) {
  const [amount, setAmount] = useState(
    existingPosition ? formatUsdc(existingPosition.amountUsdc) : "10",
  );
  const [intervalSeconds, setIntervalSeconds] = useState(
    existingPosition?.intervalSeconds ?? DCA_INTERVALS[0].seconds,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  async function handleSubmit(active: boolean) {
    const smallest = usdcToSmallest(amount);
    if (smallest === "0") {
      setError("Amount must be greater than 0");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let sessionEnableSignature: string | undefined;
      let sessionHashesAndChainIds: string | undefined;

      if (active) {
        if (walletChainId !== activeNetwork.chainId) {
          try {
            await switchChainAsync({ chainId: activeNetwork.chainId });
          } catch {
            // Embedded wallets don't support wallet_switchEthereumChain — safe to ignore
          }
        }

        const backendSignerAddress = process.env.NEXT_PUBLIC_BACKEND_SIGNER_ADDRESS;
        if (!backendSignerAddress) {
          setError("Backend signer address not configured");
          setSaving(false);
          return;
        }
        if (!rhinestoneAccount) {
          setError("Rhinestone account not ready");
          setSaving(false);
          return;
        }

        const session = buildDcaSession({
          backendSigner: backendSignerAddress as Address,
        });

        const sessionDetails =
          await rhinestoneAccount.experimental_getSessionDetails([session]);
        const enableSig: Hex =
          await rhinestoneAccount.experimental_signEnableSession(sessionDetails);

        sessionEnableSignature = enableSig;
        sessionHashesAndChainIds = JSON.stringify(
          sessionDetails.hashesAndChainIds.map(
            (h: { chainId: bigint; sessionDigest: Hex }) => ({
              chainId: h.chainId.toString(),
              sessionDigest: h.sessionDigest,
            }),
          ),
        );
      }

      const res = await fetch("/api/dca/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smartAccountAddress,
          ownerAddress,
          dcaAmountUsdc: smallest,
          intervalSeconds,
          active,
          sessionEnableSignature,
          sessionHashesAndChainIds,
        }),
      });

      const body = await res.json();

      if (!res.ok || !body.ok) {
        setError(body.error || "Failed to save strategy");
        return;
      }

      onSaved(body.strategy);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  const isActive = existingPosition?.active ?? false;
  const pos = existingPosition;

  return (
    <div className="flex flex-col gap-4">
      {/* Execution status banner */}
      {pos && (
        <div className={`rounded-lg p-3 ${isActive && pos.sessionGranted ? "bg-emerald-50 dark:bg-emerald-950/30" : isActive && !pos.sessionGranted ? "bg-amber-50 dark:bg-amber-950/30" : "bg-zinc-50 dark:bg-zinc-800/50"}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <StatusDot color={isActive && pos.sessionGranted ? "green" : isActive ? "amber" : "amber"} />
            <span>{isActive && pos.sessionGranted ? "Active" : isActive ? "Session Required" : "Paused"}</span>
            <span className="ml-auto text-xs font-normal text-zinc-500 dark:text-zinc-400">
              {formatUsdc(pos.amountUsdc)} USDC {formatInterval(pos.intervalSeconds).toLowerCase()}
            </span>
          </div>

          {isActive && !pos.sessionGranted && (
            <div className="mt-2 rounded bg-amber-100 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              DCA is active but your wallet has not signed a session key yet. Click &quot;Grant Session&quot; below to authorize automated swaps.
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Total executions</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{pos.totalExecutions}</span>

            <span>Last executed</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {pos.lastExecutedAt ? timeAgo(pos.lastExecutedAt) : "Never"}
            </span>

            {pos.lastExecutionTxHash && (
              <>
                <span>Last tx</span>
                <a
                  href={`https://sepolia.etherscan.io/tx/${pos.lastExecutionTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  {truncateHash(pos.lastExecutionTxHash)}
                </a>
              </>
            )}

            {pos.lastExecutionError && (
              <>
                <span>Last error</span>
                <span className="font-medium text-red-600 dark:text-red-400">{pos.lastExecutionError}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Amount input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Amount per execution (USDC)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-zinc-500"
            disabled={saving}
          />
          <span className="text-sm text-zinc-500">USDC</span>
        </div>
      </div>

      {/* Interval select */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Execution interval
        </label>
        <select
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          className="w-64 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:border-zinc-500"
          disabled={saving}
        >
          {DCA_INTERVALS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary */}
      <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">Token pair:</span> USDC → ETH (WETH)
        </div>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">Chain:</span> Ethereum Sepolia (testnet)
        </div>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="font-medium">Max slippage:</span> 0.5%
        </div>
      </div>

      {usdcBalance !== null && (() => {
        const balNum = parseFloat(usdcBalance);
        const amtNum = parseFloat(amount);
        if (!isNaN(balNum) && !isNaN(amtNum) && amtNum > balNum) {
          return (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              DCA amount ({amtNum.toFixed(2)} USDC) exceeds your balance ({balNum.toFixed(2)} USDC).
              Deposit more USDC before activating.
            </div>
          );
        }
        return null;
      })()}

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {isActive && !existingPosition?.sessionGranted ? (
          <>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              type="button"
              className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Signing..." : "Grant Session"}
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving}
              type="button"
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Pause DCA
            </button>
          </>
        ) : !isActive ? (
          <button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            type="button"
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : existingPosition ? "Update & Activate" : "Start DCA"}
          </button>
        ) : (
          <>
            <button
              onClick={() => handleSubmit(true)}
              disabled={saving}
              type="button"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving..." : "Update Strategy"}
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving}
              type="button"
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Pause DCA
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function Home() {
  const appKitAccount = useAppKitAccount();
  const wagmiAccount = useAccount();
  const {
    rhinestoneAccount,
    accountAddress: rhinestoneAddress,
    portfolio: rhinestonePortfolio,
    onChainBalances,
    isLoading: rhinestoneLoading,
    error: rhinestoneError,
    refreshPortfolio,
  } = useRhinestoneAccount();

  const isConnected = appKitAccount.isConnected && !!appKitAccount.address;

  const [position, setPosition] = useState<DcaPosition | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);

  const loadPosition = useCallback(async () => {
    if (!rhinestoneAddress) return;
    setPositionLoading(true);
    try {
      const res = await fetch(`/api/dca/strategy?address=${rhinestoneAddress}`);
      const body = await res.json();
      setPosition(body.strategy ?? null);
    } catch {
      // ignore
    } finally {
      setPositionLoading(false);
    }
  }, [rhinestoneAddress]);

  useEffect(() => {
    if (rhinestoneAddress) {
      loadPosition();
    }
  }, [rhinestoneAddress, loadPosition]);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6">
      <div className="mx-auto w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">DefiPanda</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Automated DCA on Chainlink CRE
            </p>
          </div>
          <appkit-button />
        </div>

        {/* Not connected */}
        {!isConnected && (
          <Card className="text-center">
            <div className="flex flex-col items-center gap-3 py-8">
              <h2 className="text-lg font-semibold">Connect your wallet</h2>
              <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                Sign in with your social account or connect a wallet to start
                your automated DCA strategy.
              </p>
              <div className="mt-2">
                <appkit-button />
              </div>
            </div>
          </Card>
        )}

        {/* Connected */}
        {isConnected && (
          <div className="flex flex-col gap-4">
            {/* Smart Account */}
            <Card>
              <SectionTitle>Smart Account</SectionTitle>
              {rhinestoneLoading ? (
                <div className="flex items-center gap-2">
                  <StatusDot color="amber" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Initializing Rhinestone account...</span>
                </div>
              ) : rhinestoneError ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <StatusDot color="red" />
                    <span className="text-xs text-zinc-500">Account error</span>
                  </div>
                  <div className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                    {rhinestoneError}
                  </div>
                </div>
              ) : rhinestoneAddress ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <StatusDot color="green" />
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">ERC-7579 (same address on all chains)</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Address</span>
                    <code className="break-all rounded-lg bg-zinc-100 px-3 py-2 text-xs font-mono dark:bg-zinc-800">
                      {rhinestoneAddress}
                    </code>
                  </div>
                  {wagmiAccount.chainId && (
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">
                      Connected chain: {wagmiAccount.chainId}
                    </div>
                  )}
                </div>
              ) : null}
            </Card>

            {/* On-chain balances (active chain) */}
            {rhinestoneAddress && (
              <Card>
                <SectionTitle>Balances</SectionTitle>
                <OnChainBalancesView balances={onChainBalances} onRefresh={refreshPortfolio} />
              </Card>
            )}

            {/* Cross-chain portfolio (Rhinestone aggregated) */}
            {rhinestoneAddress && rhinestonePortfolio.length > 0 && (
              <Card>
                <SectionTitle>Cross-Chain Portfolio</SectionTitle>
                <PortfolioView portfolio={rhinestonePortfolio} onRefresh={refreshPortfolio} />
              </Card>
            )}

            {/* Deposit */}
            {rhinestoneAddress && (
              <Card>
                <SectionTitle>Deposit Funds</SectionTitle>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Send USDC to your smart account address on Ethereum Sepolia to fund your DCA strategy.
                </p>
                <div className="mt-3 flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Send USDC to:</span>
                  <code className="break-all rounded-lg bg-zinc-100 px-3 py-2 text-xs font-mono dark:bg-zinc-800">
                    {rhinestoneAddress}
                  </code>
                </div>
                <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  Get testnet USDC from the{" "}
                  <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">
                    Circle faucet
                  </a>
                  {" "}(select Ethereum Sepolia).
                </div>
              </Card>
            )}

            {/* DCA Strategy */}
            {rhinestoneAddress && appKitAccount.address && (
              <Card>
                <SectionTitle>DCA Strategy</SectionTitle>
                {positionLoading ? (
                  <div className="flex items-center gap-2 py-4">
                    <StatusDot color="amber" />
                    <span className="text-xs text-zinc-500">Loading strategy...</span>
                  </div>
                ) : (
                  <DcaStrategyForm
                    smartAccountAddress={rhinestoneAddress}
                    ownerAddress={appKitAccount.address}
                    existingPosition={position}
                    onSaved={(p) => setPosition(p)}
                    usdcBalance={onChainBalances?.usdc ?? null}
                    rhinestoneAccount={rhinestoneAccount}
                  />
                )}
              </Card>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          Ethereum Sepolia testnet only. No real funds.
        </div>
      </div>
    </div>
  );
}
