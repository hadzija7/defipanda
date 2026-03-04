# Phase 11 — Mainnet Launch Plan

> Status: **DRAFT** · Created: 2026-03-04

## Context

Phases 1–9.6 deliver a working DCA system on **Ethereum Sepolia** with Rhinestone-sponsored gas (`sponsored: true`). Rhinestone testnet sponsorship is free; on mainnet it will not be. This plan covers the three pillars needed for a production-grade mainnet deployment:

1. **Gas payment strategy** — how transactions get paid for without free sponsorship
2. **Multi-network support** — letting users pick Sepolia vs Mainnet (and future chains)
3. **Monetization** — how DefiPanda sustains itself by charging a fee per DCA execution

### Design Principle for V1

Avoid deploying custom smart contracts. All fee collection and execution should work through existing infrastructure (smart account session keys, Rhinestone orchestrator, Uniswap router). A protocol contract is deferred to V2.

---

## 1. Gas Payment Strategy

### 1.1 Current State (Testnet)

All transactions use `sponsored: true` through the Rhinestone orchestrator. The orchestrator's filler pays gas and executes on-chain. This works because:

- Testnet gas is free — Rhinestone absorbs it
- Session key permissions only authorize `approve(USDC)` + `exactInputSingle(SwapRouter02)`
- Non-sponsored routing injects Permit2/Paymaster calls that violate session permissions

### 1.2 Options for Mainnet

#### Option A: Rhinestone-Funded Sponsorship (check first)

`sponsored: true` may work on mainnet if Rhinestone offers a credits/billing model where the API key holder pays.

| Attribute | Detail |
|-----------|--------|
| Code changes | Zero — same flow |
| Economics | DefiPanda deposits funds with Rhinestone; recoups via DCA fee (§3) |
| Risk | Depends entirely on Rhinestone offering this |
| Action | **Email/Discord Rhinestone**: "Does `sponsored: true` work on mainnet with a funded account? Is there a credits/billing model for API key holders?" |

**Verdict:** Investigate first. If available, this is by far the simplest path.

#### Option B: Expand Session Permissions for Non-Sponsored Routing

Stay with Rhinestone orchestrator, set `sponsored: false`, and add Permit2/Paymaster contract calls to the session definition so the orchestrator's non-sponsored routing doesn't violate permissions.

| Attribute | Detail |
|-----------|--------|
| Code changes | Modify `buildDcaSession()` to include Permit2 + Paymaster actions |
| Economics | Gas paid from user's token balance (USDC) via Permit2 |
| Risk | **High** — Permit2 selectors and paymaster address are Rhinestone internals; fragile coupling. Significantly widens session permission surface. |

**Verdict:** Avoid unless A and C are unavailable.

#### Option C: Direct 4337 Bundler + ERC-20 Paymaster (most robust)

Bypass the Rhinestone orchestrator for mainnet execution. Use a standard ERC-4337 bundler (Pimlico, Alchemy, StackUp) paired with an ERC-20 verifying paymaster that accepts USDC as gas payment.

How it works:
1. Backend builds the same `approve` + `exactInputSingle` calldata (unchanged)
2. Instead of orchestrator intents, construct a raw **UserOperation** with those calls
3. Attach a paymaster (e.g., Pimlico's ERC-20 paymaster) that pays gas in exchange for USDC
4. Session key signs the UserOp — Rhinestone's Safe module still validates session permissions
5. Bundler submits the UserOp on-chain

**Key insight:** The paymaster interaction lives in the UserOp's `paymasterAndData` field, **not** in `callData`. Session policies validate `callData` only, so session permissions stay narrow.

| Attribute | Detail |
|-----------|--------|
| Code changes | New executor module `executors/rhinestone-mainnet.ts`; Pimlico SDK dependency; paymaster config per network |
| Economics | User pays gas in USDC (great UX); no subsidy from DefiPanda |
| Risk | Most complex to build; need to validate Pimlico paymaster + Rhinestone Safe module interop |

**Verdict:** Best long-term approach if Option A is unavailable. Build as a network-aware executor variant.

#### Option D: Backend-Funded ETH Gas + Fee Recoup

Backend holds an ETH balance, pays gas directly, and recoups cost by deducting a USDC fee from each DCA swap amount (see §3).

| Attribute | Detail |
|-----------|--------|
| Code changes | Backend needs ETH funding mechanism + gas estimation + fee accounting |
| Economics | DefiPanda fronts gas; recoups via USDC fee deduction from swap amount |
| Risk | Requires backend ETH treasury management; gas price spikes create exposure |

**Verdict:** Viable as a bridge if Option A is confirmed but fee recoup is needed before paymaster integration.

### 1.3 Recommended Sequencing

```
1. Check Option A (Rhinestone billing) — 1 day
   ↓ available? → ship it, add fee deduction (§3), done
   ↓ not available?
2. Build Option C (bundler + paymaster) — 1-2 weeks
   - New executor: rhinestone-mainnet.ts
   - Pimlico paymaster integration
   - Network-aware executor routing
```

### 1.4 Frontend Gas (User-Initiated Transactions)

Frontend operations (account deploy, session enable, withdrawals) are signed by the user directly — no session key constraint. Options:

- **Pimlico/Alchemy paymaster** (free tiers exist even on mainnet)
- **User pays from smart account ETH balance** (requires ETH deposit step — worse UX)
- **Option A** if Rhinestone billing is available

Recommendation: Use a paymaster service for frontend operations regardless of backend gas strategy.

---

## 2. Multi-Network Support

### 2.1 Current State

- `activeNetwork` is a compile-time constant in `web/src/lib/constants/networks.ts`
- `ACTIVE_NETWORK_ID: NetworkId = "ETH_SEPOLIA"` — hardcoded, one network at a time
- DB `dca_positions` has no `chain_id` column — all positions are implicitly on the active network
- Session keys are built for one chain
- CRE workflow config has a single `priceFeedChainSelectorName`

### 2.2 Changes Required

#### 2.2.1 Network Registry (extend `networks.ts`)

Add mainnet definitions and a `gasStrategy` field:

```typescript
export type GasStrategy = "sponsored" | "paymaster-usdc" | "bundler-eth";

export type NetworkConfig = {
  // ... existing fields ...
  isTestnet: boolean;
  gasStrategy: GasStrategy;
  paymasterUrl?: string;
  bundlerUrl?: string;
  blockExplorerUrl: string;
};

const ETH_MAINNET: NetworkConfig = {
  chain: mainnet,
  chainId: 1,
  name: "Ethereum Mainnet",
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  usdcDecimals: 6,
  weth: "0xC02aaA39b223FE8D0A0e5c4F27eAD9083C756Cc2",
  wethDecimals: 18,
  uniswapV3SwapRouter02: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  uniswapV3PoolFee: 500, // 0.05% — mainnet USDC/ETH is deep at 500
  chainlinkEthUsdPriceFeed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  creChainSelectorName: "ethereum-mainnet",
  isTestnet: false,
  gasStrategy: "paymaster-usdc", // or "sponsored" if Option A works
  blockExplorerUrl: "https://etherscan.io",
};
```

#### 2.2.2 Frontend Network Selector

- Replace compile-time `activeNetwork` with runtime state
- Add a network selector dropdown to the UI (e.g., in the header/wallet area)
- Persist selected network in localStorage + URL query param
- When user switches network:
  - Re-derive Rhinestone smart account address for that chain
  - Reload balances from the new chain
  - Load DCA position for that chain from DB
  - Update explorer links

**State shape:**

```typescript
// React context or zustand store
type NetworkState = {
  activeNetworkId: NetworkId;
  setNetwork: (id: NetworkId) => void;
};
```

#### 2.2.3 DB Schema: Add `chain_id` to `dca_positions`

```sql
ALTER TABLE dca_positions
  ADD COLUMN chain_id INTEGER NOT NULL DEFAULT 11155111;

-- Update unique constraint
ALTER TABLE dca_positions
  DROP CONSTRAINT dca_positions_smart_account_address_smart_account_provider_key;
ALTER TABLE dca_positions
  ADD CONSTRAINT dca_positions_address_provider_chain_key
    UNIQUE (smart_account_address, smart_account_provider, chain_id);
```

This allows the same smart account to have separate DCA positions on different chains.

#### 2.2.4 Backend Execution: Network-Aware

- `getDuePositions()` must filter by `chain_id`
- Executor receives network config (chain, contracts, gas strategy) instead of reading the global `activeNetwork`
- CRE trigger must indicate which chain it's triggering for (or run separate CRE workflows per chain)

#### 2.2.5 CRE Workflow: Per-Chain or Multi-Chain

Two options:
- **Separate CRE workflow per chain** (simpler) — each has its own price feed config and backend URL
- **Single CRE workflow, multi-chain** (advanced) — one workflow triggers execution for all chains

Recommendation: Start with separate workflows per chain. One `docker-compose` service per chain (`cre-cron-sepolia`, `cre-cron-mainnet`).

### 2.3 Implementation Order

1. Add `chain_id` to DB schema + update store queries
2. Add mainnet `NetworkConfig` + `gasStrategy` field
3. Make executor network-aware (pass config instead of reading global)
4. Add frontend network selector (context provider + dropdown)
5. Add per-chain CRE workflow config
6. Test: activate DCA on Sepolia, switch to Mainnet, verify positions are independent

---

## 3. Monetization — Fee Strategy

### 3.1 Design Constraints (V1)

- **No custom smart contract** — all execution goes through existing Uniswap V3 router
- Session keys only authorize `approve(USDC)` + `exactInputSingle(SwapRouter02)` — any fee mechanism must work within these permissions or expand them minimally
- Must be transparent to users (they should see the fee)

### 3.2 Option F1: Deduct Fee from Swap Input (Recommended for V1)

Reduce the user's `amountIn` by a fee percentage before the swap. The fee USDC stays in the smart account and is collected separately.

**How it works:**
1. User configures DCA for 100 USDC per interval
2. Backend calculates: `fee = 100 * 0.003 = 0.30 USDC` (0.3% example)
3. Backend executes swap with `amountIn = 99.70 USDC`
4. The 0.30 USDC remains in the smart account
5. Separately (batched, off-peak), a **fee sweep** transfers accumulated fees to the DefiPanda treasury

**Fee sweep options:**
- **(a) Session key sweep** — expand the session to allow `transfer(USDC → TREASURY_ADDRESS)`. This adds one action to the session definition. Minimal security expansion since the target is a fixed address.
- **(b) User-initiated sweep** — frontend shows accumulated fees and user can "claim" them to the treasury (unlikely — bad UX)
- **(c) Accept fee stays in account** — simplest: fee USDC just stays in the smart account. The user effectively pays less per swap but the "fee" is really a reduced execution amount. DefiPanda doesn't collect anything directly. Monetize differently (subscription, premium tiers).

**Recommendation:** Start with **(c)** for launch simplicity — the fee is just a reduced swap amount, clearly shown in the UI. Plan **(a)** for V1.1 when you want to actually collect revenue.

### 3.3 Option F2: Add `transfer` to Session + Collect Per-Swap

Add a third call to each DCA execution: `transfer(USDC, TREASURY, feeAmount)`.

**Session expansion required:**

```typescript
// In buildDcaSession():
actions: [
  // ... existing approve + swap actions ...
  {
    target: inputToken,               // USDC contract
    selector: toFunctionSelector(
      getAbiItem({ abi: erc20Abi, name: "transfer" }),
    ),
    policies: [
      {
        type: "spending-limits",
        limits: [{ token: inputToken, amount: feeSpendingLimit }],
      },
    ],
  },
]
```

**Execution change in `rhinestone.ts`:**

```typescript
const feeAmount = (amountIn * feeBps) / BigInt(10_000);
const netAmountIn = amountIn - feeAmount;

const calls = [
  { to: activeNetwork.usdc, value: 0n, data: approveCalldata(netAmountIn) },
  { to: activeNetwork.uniswapV3SwapRouter02, value: 0n, data: swapCalldata(netAmountIn) },
  { to: activeNetwork.usdc, value: 0n, data: transferCalldata(TREASURY, feeAmount) },
];
```

| Attribute | Detail |
|-----------|--------|
| Code changes | Session definition + executor + env var for treasury address + fee BPS config |
| UX | User sees "100 USDC per swap, 0.30 USDC fee" in the frontend |
| Session impact | Adds `transfer(USDC)` with spending limit — moderate expansion. Target is unrestricted (any address), but spending limit caps total transferable amount. Could restrict target via custom policy if Rhinestone supports it. |
| When | V1.1 — after launch, when revenue collection is needed |

### 3.4 Option F3: Protocol Contract (V2)

Deploy a `DefiPandaDCA` contract that:
- Acts as a proxy between smart account and Uniswap
- Deducts fee atomically during the swap
- Could store positions on-chain (eliminating the DB)
- Could integrate with a fee-sharing / staking mechanism

**Deferred to V2.** Requires contract audit, deployment infrastructure, and changes the trust model (users must trust the contract, not just session key permissions).

### 3.5 Fee Configuration

```typescript
// Environment or DB-configurable
const FEE_CONFIG = {
  feeBps: 30,                // 0.30%
  minFeeBps: 10,             // 0.10% floor
  maxFeeBps: 100,            // 1.00% cap
  treasuryAddress: "0x...",  // DefiPanda multisig
  feeEnabled: false,         // feature flag for launch
};
```

### 3.6 Monetization Recommendation

| Phase | Strategy | Revenue |
|-------|----------|---------|
| V1 launch (mainnet) | Reduced swap amount (F1c) — no collection | None (growth phase) |
| V1.1 | Session-key fee transfer (F2) | 0.3% per swap |
| V2 | Protocol contract (F3) | 0.3% per swap + on-chain position storage |

---

## 4. Implementation Phases

### Phase 11.1 — Gas Strategy Resolution
- [ ] Contact Rhinestone about mainnet `sponsored: true` billing model
- [ ] If available: document pricing, set up billing, test on mainnet
- [ ] If not available: spike on Pimlico ERC-20 paymaster + Rhinestone Safe interop
- [ ] Decision: confirm gas strategy for mainnet

### Phase 11.2 — Multi-Network Foundation
- [ ] Add `chain_id` column to `dca_positions` (with migration)
- [ ] Add mainnet `NetworkConfig` to `networks.ts`
- [ ] Add `gasStrategy`, `isTestnet`, `blockExplorerUrl` fields to `NetworkConfig`
- [ ] Make `getDuePositions()` and `upsertPosition()` chain-aware
- [ ] Make executor accept `NetworkConfig` parameter instead of reading global

### Phase 11.3 — Frontend Network Selector
- [ ] Create `NetworkContext` provider with localStorage persistence
- [ ] Add network dropdown component to header
- [ ] Re-derive Rhinestone account on network switch
- [ ] Reload balances and DCA position on network switch
- [ ] Update all explorer links to use `activeNetwork.blockExplorerUrl`
- [ ] Show testnet badge / warning when on Sepolia

### Phase 11.4 — Mainnet Gas Execution
- [ ] (If Option A) Test `sponsored: true` on mainnet with funded Rhinestone account
- [ ] (If Option C) Build `executors/rhinestone-direct.ts` with Pimlico bundler + paymaster
- [ ] Add network-aware executor routing in `executors/index.ts`
- [ ] Frontend paymaster integration for user-initiated transactions
- [ ] Test full DCA cycle on mainnet (with small amounts)

### Phase 11.5 — Monetization (V1.1)
- [ ] Add fee calculation to executor (`feeBps` config)
- [ ] Show fee breakdown in frontend DCA configuration UI
- [ ] (V1.1) Expand session definition with `transfer(USDC)` action
- [ ] (V1.1) Add fee collection call to executor
- [ ] (V1.1) Treasury address management + fee accounting dashboard

### Phase 11.6 — Per-Chain CRE Automation
- [ ] Create mainnet CRE workflow config (mainnet price feed, chain selector)
- [ ] Add `cre-cron-mainnet` service to `docker-compose.yml`
- [ ] Verify CRE price feed reads work on mainnet Chainlink oracles
- [ ] Set appropriate `CRE_CRON_INTERVAL_SECONDS` for mainnet (longer intervals to manage gas)

---

## 5. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rhinestone doesn't offer mainnet sponsorship billing | Must build Option C (2 week delay) | Investigate early (Phase 11.1) |
| Pimlico paymaster doesn't work with Rhinestone Safe modules | Blocks Option C entirely | Spike early; fallback to Option B or D |
| Mainnet gas spikes make DCA uneconomical for small amounts | Users churn | Set minimum DCA amount (e.g., $50); show estimated gas per execution; allow users to choose execution frequency |
| Session key `transfer` permission is exploitable | Fee sweep could be abused | Spending limit caps total; fixed treasury target in V1.1; full contract isolation in V2 |
| Uniswap V3 pool fee tier mismatch on mainnet | Swaps fail or get worse pricing | Verify USDC/WETH liquidity at 500 (0.05%) vs 3000 (0.3%) fee tier on mainnet before launch |

---

## 6. Open Questions

1. **Rhinestone mainnet billing** — does `sponsored: true` work with a funded API key?
2. **Pimlico + Rhinestone interop** — does the ERC-20 paymaster work when the smart account is a Safe with Rhinestone 7579 modules?
3. **Minimum viable DCA amount on mainnet** — what's the gas cost per execution, and what DCA amount makes the fee ratio acceptable?
4. **Multi-chain session keys** — does the same session enable signature work across chains, or does the user need to re-sign per chain?
5. **Uniswap V3 fee tier** — USDC/ETH on mainnet: 500 bps (0.05%) has the deepest liquidity. Confirm and update `uniswapV3PoolFee` accordingly.
