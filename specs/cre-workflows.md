# CRE Workflows Spec

Status: In Progress

## Overview

Chainlink CRE (Chainlink Runtime Environment) provides the decentralized automation layer for DefiPanda's DCA strategy execution. CRE workflows run on a Decentralized Oracle Network (DON) where multiple nodes independently execute the same logic and reach BFT consensus on results before acting.

## System Boundaries

| Concern | Owner | Rationale |
|---------|-------|-----------|
| DCA scheduling | CRE (cron trigger) | Distributed, fault-tolerant scheduling |
| Market data reading | CRE (EVM read + HTTP) | Consensus-verified price data |
| Execution decision | CRE (workflow logic) | Decentralized agreement on whether/how to execute |
| Transaction signing | Backend | Session key private key must not be in CRE (for now) |
| Transaction submission | Backend (Rhinestone SDK, intent-based prepare/sign/submit) | TypeScript SDK requires Node.js runtime |
| User auth + strategy config | Backend (Next.js) | Server-side sessions, database, UI |
| Strategy display + controls | Frontend (Next.js) | Client-side Reown AppKit + Rhinestone hooks |

## DCA Workflow: Trigger and Execution Model

### Trigger
- **Type**: Cron trigger via `CronCapability`
- **Schedule**: Configurable per environment (e.g., every 5 minutes for staging, hourly for production)
- **Config source**: `config.staging.json` / `config.production.json`

### V1 Strategy Model

V1 is intentionally simple — a fixed USDC → ETH DCA:
- **User chooses**: amount per execution (e.g., 10 USDC). Interval is global (CRE cron schedule).
- **Token pair is fixed**: always USDC → ETH (WETH)
- **No conditional logic**: every trigger fires an execution
- **CRE's consensus on price** is used for the audit trail (proving fair execution), not for go/no-go decisions
- Future phases add sophisticated strategies (multi-token, limit orders, AI-driven timing)

### Execution Flow (Phase 9: Smart Trigger + Backend Executor)

```
CRE DON (N nodes)
  │
  ├── 1. Cron fires
  ├── 2. EVM Read: Chainlink ETH/USD price feed latestRoundData()
  │       → consensus: median price across nodes
  ├── 3. Check: skip if price data stale
  ├── 4. HTTP POST → backend /api/dca/execute
  │       → sends consensusPrice + maxSlippage + executionId
  │       → cacheSettings ensures single execution
  │       → bearer token from secrets for auth
  └── 5. Log result (price, backend response)

Backend then iterates all active user strategies and executes each
user's configured USDC amount as a swap.
```

### CRE Capabilities Used

| Capability | Purpose | Consensus Model |
|------------|---------|-----------------|
| `CronCapability` | Schedule-based trigger | N/A (trigger only) |
| `EVMClient.callContract()` | Read price feed on-chain | All nodes read independently, BFT consensus on result |
| `HTTPClient.sendRequest()` | POST execution to backend | `cacheSettings` ensures single POST with consensus on response |
| `runtime.getSecret()` | Retrieve auth token | Node-local secret access from Vault DON |

## Configuration Schema

### Workflow Config (`config.{env}.json`)

```json
{
  "schedule": "0 */5 * * * *",
  "priceFeedAddress": "0x...",
  "chainSelectorName": "ethereum-testnet-sepolia-base-1",
  "maxSlippageBps": 50,
  "minPriceFeedFreshnessSeconds": 300
}
```

| Field | Type | Description |
|-------|------|-------------|
| `schedule` | string | Cron expression for trigger frequency |
| `priceFeedAddress` | address | Chainlink ETH/USD price feed contract address |
| `chainSelectorName` | string | CRE chain selector name for EVM client |
| `maxSlippageBps` | number | Maximum slippage tolerance in basis points |
| `minPriceFeedFreshnessSeconds` | number | Skip execution if price feed is older than this |

**Note:** per-user DCA config (amount, active/paused) lives in the backend database,
not in CRE config. Token pair is fixed to USDC → ETH in v1. CRE only needs market
context (price feed, slippage) and backend connectivity.

### Workflow Settings (`workflow.yaml`)

```yaml
staging-settings:
  user-workflow:
    workflow-name: "dca-workflow-staging"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.staging.json"
    secrets-path: "../secrets.yaml"

production-settings:
  user-workflow:
    workflow-name: "dca-workflow-production"
  workflow-artifacts:
    workflow-path: "./main.ts"
    config-path: "./config.production.json"
    secrets-path: "../secrets.yaml"
```

## Secrets

### Declared Secrets (`secrets.yaml`)

```yaml
secretsNames:
  BACKEND_AUTH_TOKEN:
    - BACKEND_AUTH_TOKEN_ALL
  BACKEND_URL:
    - BACKEND_URL_ALL
```

| Secret | Purpose |
|--------|---------|
| `BACKEND_AUTH_TOKEN` | Bearer token for authenticating CRE → backend HTTP calls |
| `BACKEND_URL` | Base URL of the backend API (e.g., `https://app.defipanda.xyz`) |

### Secret Access Pattern

Secrets are accessed via `runtime.getSecret()` inside `runInNodeMode` (node-level execution):
```typescript
const token = nodeRuntime.getSecret({ id: "BACKEND_AUTH_TOKEN" }).result()
```

For local simulation: secrets come from `.env` file or shell environment variables.
For deployed workflows: secrets are stored in the Vault DON via `cre secrets create`.

## Failure Handling

### Price Feed Stale
- Read `updatedAt` from `latestRoundData()` response
- If `now - updatedAt > minPriceFeedFreshnessSeconds`, skip execution
- Log: "Price feed stale, skipping DCA execution"

### Backend Unreachable
- HTTP POST returns non-200 or times out
- CRE logs error; execution is skipped for this cycle
- Next cron trigger will attempt again

### Backend Returns Error
- 400: bad request (log and skip, likely misconfiguration)
- 409: duplicate execution (idempotency guard, log and treat as success)
- 500: server error (log and skip, retry on next cycle)

### DON Node Failures
- BFT consensus tolerates minority node failures
- As long as 2f+1 honest nodes agree, execution proceeds

### Double-Execution Prevention
- CRE side: `cacheSettings.readFromCache = true` ensures only one node makes the actual POST
- Backend side: idempotency key in request body prevents duplicate transaction submission

## Environment Separation

| Aspect | Staging | Production |
|--------|---------|------------|
| Schedule | Every 30 seconds | Every 5 minutes (or hourly) |
| Chain | Base Sepolia | Base mainnet (future) |
| Price feed | Testnet feed | Mainnet Chainlink feed |
| Backend URL | localhost / staging URL | Production URL |
| Token addresses | Testnet USDC/WETH | Mainnet tokens |

## Current Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Cron trigger | Implemented | Fires on configurable schedule |
| EVM read (price feed) | Implemented | Reads Chainlink ETH/USD latestRoundData() on Ethereum Sepolia |
| HTTP POST to backend | Implemented | POSTs to backend with bearer token auth via runInNodeMode + secrets |
| Execution decision logic | Implemented | Price staleness check based on minPriceFeedFreshnessSeconds |
| Secrets configuration | Implemented | secrets.yaml with BACKEND_AUTH_TOKEN + BACKEND_URL; .env for simulation |
| Config schema (Zod) | Implemented | schedule, priceFeedAddress, priceFeedChainSelectorName, maxSlippageBps, minPriceFeedFreshnessSeconds |
| Backend auth | Implemented | Bearer token validation with constant-time comparison |
| DEX swap encoding | Implemented | Uniswap V3 SwapRouter02 exactInputSingle (USDC→WETH) |
| Session key permissions | Implemented | approve + exactInputSingle on DEX router with spending-limit + time-frame |
| Idempotency | Implemented | In-memory store keyed by executionId (cre-round-{roundId}) |
| End-to-end simulation | Not verified | Pending `cre workflow simulate` run |

## Future: Hybrid CRE Execution (Post-Phase 9)

After the Smart Trigger pattern is working, explore moving signing into CRE:

1. Store session key private key as a CRE secret
2. Use viem's `privateKeyToAccount` + `signTransaction` inside CRE WASM runtime
3. Submit signed transaction via HTTP POST to an RPC endpoint
4. Eliminates backend from the execution hot path

**Key compatibility question:** Does viem's secp256k1 signing (via noble-curves) work in CRE's QuickJS WASM runtime? noble-curves is pure JS with no `node:crypto` dependency, so it likely works. Needs verification via `cre workflow simulate`.

## Dependencies

| Dependency | Version | Used For |
|------------|---------|----------|
| `@chainlink/cre-sdk` | latest | CRE SDK (HTTPClient, EVMClient, CronCapability, consensus) |
| `viem` | ^2.x | ABI encoding for EVM reads (already a peer dep of CRE SDK) |
| `zod` | ^3.x | Config schema validation |
