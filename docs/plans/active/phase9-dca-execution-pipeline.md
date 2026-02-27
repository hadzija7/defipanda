# Phase 9: DCA Execution Pipeline (CRE Smart Trigger + Backend Executor)

Status: Planned

## Goal

Wire the full DCA execution loop: CRE workflow fires on a user-configured schedule,
reads the current ETH/USD price with DON consensus, and triggers the backend to
execute a USDC → ETH swap via Rhinestone session keys on the user's smart account.

## V1 Strategy Model

V1 is intentionally simple — a fixed USDC → ETH DCA:

- **User chooses**: interval (e.g., every hour, daily) and amount per execution (e.g., 10 USDC)
- **Token pair is fixed**: always USDC → ETH (WETH)
- **No stop-loss, no take-profit, no conditional logic**
- **CRE's role**: reliable schedule + consensus-verified price for audit trail
- **Backend's role**: execute the swap at whatever the current market price is

Future phases can introduce sophisticated strategies (multi-token, limit orders,
portfolio rebalancing, AI-driven timing), but v1 is pure time-based DCA.

## Current State (What Exists)

### CRE Workflow (`cre/dca-workflow/`)
- Skeleton only: cron trigger that logs "Hello world!"
- Config: 30-second cron schedule
- No HTTP client, EVM read, or secrets usage

### Backend DCA Endpoint (`/api/dca/execute`)
- Accepts `smartAccountAddress`, `tokenAddress`, `recipientAddress`, `amount`
- Encodes an ERC-20 `transfer` (not a swap) via Rhinestone session key
- Hardcoded to Base Sepolia chain
- No authentication/authorization on the endpoint

### Session Keys (`rhinestone-sessions.ts`)
- Grants permission to call `transfer()` on a single ERC-20 token
- Policies: spending-limits + time-frame
- Does NOT grant permission to call DEX swap functions

### Smart Account
- Rhinestone ERC-7579 smart account wrapping Reown AppKit signer
- Cross-chain portfolio view via orchestrator
- Session key enablement flow exists (user signs once)

## Architecture: Option B (Smart Trigger + Backend Executor)

```
┌─────────────────────────────────────────────────────┐
│  CRE Workflow (Decentralized DON)                   │
│                                                     │
│  Cron Trigger (every N minutes)                     │
│       │                                             │
│       ▼                                             │
│  EVM Read: ETH/USD Chainlink price feed             │
│       │                                             │
│       ▼                                             │
│  Consensus: all nodes agree on current ETH price    │
│       │                                             │
│       ▼                                             │
│  HTTP POST → backend /api/dca/execute               │
│  (with consensus-verified execution params)         │
│  (uses cacheSettings for single-execution)          │
│  (uses secret for auth bearer token)                │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  Backend (Next.js API Route)                        │
│                                                     │
│  POST /api/dca/execute                              │
│  1. Validate CRE auth token                         │
│  2. Look up user's smart account + DCA config       │
│  3. Encode USDC→ETH swap (Uniswap V3)              │
│  4. Submit via Rhinestone session key               │
│  5. Wait for execution receipt                      │
│  6. Return result to CRE                            │
└─────────────────────────────────────────────────────┘
```

### What CRE adds beyond a cron job
- **Consensus on ETH price**: N DON nodes independently read the price feed and must agree — provides a verifiable price at execution time for the user's audit trail
- **Reliable scheduling**: DON-level fault tolerance (individual node failures don't stop execution)
- **Verifiable execution trail**: cryptographic proof of what price was observed and when

### What the backend adds
- **Session key custody**: holds `SMART_ACCOUNT_OWNER_PRIVATE_KEY` securely
- **Rhinestone SDK integration**: constructs and submits swap transactions
- **User account + strategy mapping**: knows which smart account to execute for, with what amount
- **Auth/session management**: manages user identity and DCA preferences

### V1 simplification
Since v1 is pure time-based DCA (no conditional logic), CRE's consensus on price is
used for the **audit trail** (proving execution happened at a fair price), not for
execution decisions. Every trigger fires an execution. Future versions can add price
thresholds, volatility checks, or limit-order logic in the CRE workflow itself.

## Implementation Plan

### Step 1: Upgrade CRE Workflow

Transform `cre/dca-workflow/main.ts` from hello-world to smart trigger:

**New capabilities used:**
- `HTTPClient.sendRequest()` — POST execution request to backend
- `EVMClient.callContract()` — read Chainlink price feed on-chain
- `runtime.getSecret()` — retrieve backend URL and auth token
- `consensusIdenticalAggregation` / `ConsensusAggregationByFields` + `median` — agree on price data

**New config schema (v1 — fixed USDC→ETH):**
```json
{
  "schedule": "0 */5 * * * *",
  "priceFeedAddress": "0x...",
  "chainSelectorName": "ethereum-testnet-sepolia-base-1",
  "maxSlippageBps": 50,
  "minPriceFeedFreshnessSeconds": 300
}
```

Note: `inputToken`, `outputToken`, and `dcaAmountPerExecution` are NOT in CRE config.
They are user-configurable via the frontend and stored in the backend database.
CRE doesn't need to know the user's amount — it reads the price and tells the backend
to execute; the backend looks up each active user's DCA config.

**New secrets (in `secrets.yaml`):**
```yaml
secretsNames:
  BACKEND_AUTH_TOKEN:
    - BACKEND_AUTH_TOKEN_ALL
  BACKEND_URL:
    - BACKEND_URL_ALL
```

**V1 workflow logic (pseudocode):**
1. On cron trigger
2. EVM Read: call Chainlink ETH/USD price feed `latestRoundData()`
3. Check: if price data is stale (older than `minPriceFeedFreshnessSeconds`), skip
4. HTTP POST to `{BACKEND_URL}/api/dca/execute` with:
   - `consensusPrice` (ETH/USD at execution time, for audit trail)
   - `maxSlippageBps` (from config)
   - `executionTimestamp`
   - Bearer token from secrets for auth
   - `cacheSettings` to ensure single execution across DON nodes
5. Log result (price, backend response status)

The backend then iterates over all active DCA strategies and executes each user's
configured amount as a USDC→ETH swap.

### Step 2: Update Session Key Permissions

Current: only permits `transfer()` on ERC-20.
Needed: permit `exactInputSingle()` on Uniswap V3 SwapRouter (or equivalent DEX).

**New session action structure:**
```typescript
actions: [
  {
    // Permit: approve input token for DEX router
    target: inputTokenAddress,
    selector: toFunctionSelector(getAbiItem({ abi: erc20Abi, name: "approve" })),
    policies: [spendingLimit, timeFrame],
  },
  {
    // Permit: call swap on DEX router
    target: UNISWAP_V3_ROUTER,
    selector: toFunctionSelector("exactInputSingle(...)"),
    policies: [spendingLimit, timeFrame],
  },
]
```

**Alternative (simpler for hackathon):** keep the `transfer` permission for now and have the backend:
1. Transfer input token from smart account to a backend-controlled address
2. Execute the swap externally
3. Transfer output token back

This avoids DEX ABI complexity in the session key but is less elegant.

### Step 3: Update Backend `/api/dca/execute`

**Changes:**
- Add bearer token authentication (validate against `CRE_BACKEND_AUTH_TOKEN` env var)
- Accept CRE-verified params: `price`, `minOutputAmount`, `slippageBps`
- Encode DEX swap calldata instead of plain `transfer`
- Add idempotency key to prevent double-execution
- Log execution with full audit trail

**New endpoint contract (v1):**
```typescript
POST /api/dca/execute
Authorization: Bearer <CRE_BACKEND_AUTH_TOKEN>

// CRE sends market context; backend looks up per-user DCA configs
{
  "consensusPrice": "3150.42",
  "maxSlippageBps": 50,
  "executionTimestamp": 1709123456,
  "executionId": "cre-exec-1709xyz"
}

// Backend response
{
  "ok": true,
  "executionsTriggered": 3,
  "results": [
    { "user": "0xabc...", "amountIn": "10000000", "txHash": "0x..." },
    { "user": "0xdef...", "amountIn": "50000000", "txHash": "0x..." },
    { "user": "0x123...", "error": "insufficient balance" }
  ]
}
```

The backend iterates all active strategies, executing each user's configured
USDC amount as a swap. Per-user config (amount, active/paused) lives in the
backend database, not in CRE.

### Step 4: CRE Secrets and Environment Setup

**CRE secrets needed:**
- `BACKEND_AUTH_TOKEN` — bearer token to authenticate CRE → backend calls

**Backend env vars needed (new):**
- `CRE_BACKEND_AUTH_TOKEN` — expected bearer token (must match CRE secret)
- `DCA_SWAP_ROUTER_ADDRESS` — DEX router contract address
- `DCA_INPUT_TOKEN` — default input token (e.g., USDC on Base Sepolia)
- `DCA_OUTPUT_TOKEN` — default output token (e.g., WETH on Base Sepolia)

### Step 5: Update Frontend

- Add DCA strategy configuration UI:
  - Amount per execution (USDC) — user-configurable
  - Frequency display (read-only, matches CRE cron schedule)
  - Token pair display: always "USDC → ETH" for v1
  - Active/paused toggle
- Display execution history (last N executions with timestamps, amounts, prices, tx hashes)
- Session key enablement button (user signs once to authorize backend)
- Current ETH price display (from CRE consensus or live feed)

## Chain and DEX Selection (Hackathon)

**Target chain:** Base Sepolia (testnet)
- CRE chain selector: `ethereum-testnet-sepolia-base-1`
- Existing Rhinestone integration already uses Base Sepolia
- Uniswap V3 is deployed on Base Sepolia

**Price feed:** Chainlink ETH/USD on Base Sepolia (or Sepolia mainnet)

**DEX:** Uniswap V3 SwapRouter on Base Sepolia
- `exactInputSingle` for simple single-hop swaps
- USDC → WETH as the default DCA pair

## Future: Hybrid CRE Execution (Option C)

After Option B is working, explore whether CRE can execute on-chain directly:

1. **CRE holds session key as a secret** — `runtime.getSecret()` retrieves the private key
2. **CRE signs transactions** — if viem's `privateKeyToAccount` + `signTransaction` work in QuickJS/WASM
3. **CRE submits via HTTP** — POST signed transaction to an RPC endpoint using `HTTPClient`

Key question: does viem's crypto work in CRE's QuickJS WASM runtime?
- QuickJS does NOT have `node:crypto`
- viem uses noble-curves for secp256k1 (pure JS, no node:crypto dependency)
- **This likely works** — needs verification via `cre workflow simulate`

If it works, the backend is eliminated from the execution path entirely. CRE holds the key, signs, and submits. Backend only handles auth and configuration.

## Non-Goals (This Phase)

- Configurable token pairs (v1 is always USDC → ETH)
- Conditional execution logic (limit orders, stop-loss, volatility checks)
- Production DEX routing / aggregation (single-hop Uniswap only)
- Gas optimization or paymaster integration
- Monitoring/alerting pipeline
- On-chain consumer contract (Option C)
- AI-driven strategy optimization

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rhinestone Smart Sessions breaking changes | Session key flow breaks | Pin SDK version, test before upgrade |
| CRE HTTP POST called N times (once per node) | Backend executes N times | Use `cacheSettings` in CRE + idempotency key in backend |
| Price feed stale/unavailable | DCA executes at wrong price | Check `updatedAt` from price feed, skip if stale |
| Backend downtime when CRE fires | DCA execution missed | Log missed executions, add retry on next trigger |
| QuickJS/WASM can't run viem crypto | Can't do Option C hybrid | Stay with Option B (CRE trigger + backend execute) |

## Implementation Order

1. CRE workflow upgrade (price read + HTTP POST)
2. Backend auth + swap calldata encoding
3. Session key permission update (DEX router)
4. CRE secrets configuration
5. Frontend DCA strategy UI
6. End-to-end simulation test
7. Docs update
