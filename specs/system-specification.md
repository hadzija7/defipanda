# DefiPanda System Specification

**Version:** 1.0  
**Last Updated:** 2026-03-02  
**Status:** Living document — update with every architectural or behavioral change

---

## 1. Product Summary

DefiPanda is an automated Dollar-Cost Averaging (DCA) platform built on Chainlink CRE (Chainlink Runtime Environment). Users connect via social login or wallet, configure a USDC → ETH DCA strategy, and the system autonomously executes swaps at regular intervals using consensus-verified price data and scoped session keys.

### V1 Scope

- **Fixed token pair:** USDC → ETH (WETH) on Ethereum Sepolia
- **User-configurable:** amount per execution, execution interval, active/paused
- **Automation:** CRE DON triggers execution on schedule; backend submits swaps via Rhinestone session keys
- **Auth:** Social login via Reown AppKit (Google, GitHub, Discord, X, Apple, Facebook, Farcaster, email OTP)
- **Smart accounts:** Rhinestone ERC-7579 with deterministic cross-chain addresses

---

## 2. System Architecture

### 2.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER (Browser)                             │
│                                                                         │
│  ┌──────────────┐    ┌─────────────────┐    ┌───────────────────────┐  │
│  │ Reown AppKit │    │ Rhinestone Hook │    │  DCA Strategy Form    │  │
│  │ <appkit-btn> │    │ useRhinestone() │    │  (amount, interval)   │  │
│  └──────┬───────┘    └───────┬─────────┘    └──────────┬────────────┘  │
│         │                    │                         │               │
└─────────┼────────────────────┼─────────────────────────┼───────────────┘
          │                    │                         │
          ▼                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NEXT.JS BACKEND (web/)                             │
│                                                                         │
│  ┌──────────────┐  ┌────────────────────┐  ┌───────────────────────┐   │
│  │  Auth Routes  │  │ /api/orchestrator  │  │ /api/dca/strategy     │   │
│  │  (OAuth,      │  │ (Rhinestone proxy) │  │ (CRUD positions)      │   │
│  │   sessions)   │  └────────┬───────────┘  └──────────┬────────────┘   │
│  └──────┬───────┘           │                         │                │
│         │                    │                         │                │
│  ┌──────┴───────┐           │              ┌──────────┴────────────┐   │
│  │ Auth/Wallet   │           │              │ /api/dca/execute      │   │
│  │ Provider      │           │              │ (session key signing  │   │
│  │ Architecture  │           │              │  + swap submission)   │   │
│  └──────────────┘           │              └──────────┬────────────┘   │
│                              │                         │                │
└──────────────────────────────┼─────────────────────────┼────────────────┘
                               │                         │
          ┌────────────────────┘              ┌──────────┘
          ▼                                   ▼
┌──────────────────┐               ┌──────────────────────┐
│  Rhinestone      │               │    PostgreSQL         │
│  Orchestrator    │               │    (users, sessions,  │
│  (intent-based   │               │     DCA positions)    │
│   tx execution)  │               └──────────────────────┘
└──────────────────┘                          ▲
                                              │
┌─────────────────────────────────────────────┼───────────────────────────┐
│                    CRE DON (N Nodes)        │                           │
│                                             │                           │
│  ┌────────────┐  ┌──────────────────┐  ┌────┴────────────────────┐    │
│  │ Cron fires │→ │ EVM Read price   │→ │ HTTP POST to backend    │    │
│  │ (schedule) │  │ feed (consensus) │  │ /api/dca/execute        │    │
│  └────────────┘  └──────────────────┘  └─────────────────────────┘    │
│                                                                         │
│  Secrets: BACKEND_AUTH_TOKEN, BACKEND_URL (via Vault DON)              │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ON-CHAIN (Ethereum Sepolia)                       │
│                                                                         │
│  ┌─────────────────┐  ┌───────────────────┐  ┌──────────────────┐     │
│  │ Rhinestone      │  │ Uniswap V3        │  │ Chainlink        │     │
│  │ ERC-7579 Smart  │  │ SwapRouter02      │  │ ETH/USD Price    │     │
│  │ Account         │  │ (USDC→WETH swap)  │  │ Feed (Sepolia)   │     │
│  └─────────────────┘  └───────────────────┘  └──────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow (DCA Execution)

1. **User** configures DCA strategy (amount, interval) in frontend → saved to PostgreSQL
2. **CRE DON** cron fires on schedule → reads ETH/USD price feed with BFT consensus
3. **CRE** POSTs consensus-verified price + execution params to backend `/api/dca/execute`
4. **Backend** queries PostgreSQL for due positions (`active = true`, interval elapsed)
5. **Backend** encodes Uniswap V3 swap calldata per position (approve + exactInputSingle)
6. **Backend** submits via Rhinestone SDK: prepare → sign (session key) → submit → wait
7. **Rhinestone orchestrator** resolves the intent and executes on-chain
8. **Backend** updates `dca_positions` with tx hash, execution count, timestamp

---

## 3. System Components

### 3.1 Web Application (`web/`)

**Runtime:** Next.js (App Router), Node.js  
**Package manager:** pnpm  
**Start:** `cd web && pnpm dev`

#### 3.1.1 Frontend (Client-Side)

| Concern | Implementation | Files |
|---------|---------------|-------|
| Auth UI | Reown AppKit `<appkit-button>` (Reown mode), Privy login/logout controls (Privy mode), ZeroDev social login button (ZeroDev mode), provider-status fallback (other modes) | `src/app/page.tsx`, `src/app/layout.tsx` |
| Runtime wallet providers | Reown AppKit provider mounts only when `AUTH_PROVIDER=reown_appkit`; Privy provider stack mounts only when `AUTH_PROVIDER=privy` | `src/context/index.tsx`, `src/context/privy-provider.tsx`, `src/context/wallet-provider-root.tsx` |
| Smart account | `useRhinestoneAccount` wraps wagmi wallet client into ERC-7579 (Reown/Privy modes); `useZeroDevSocialAccount` derives Kernel account from social validator (ZeroDev mode) | `src/hooks/useRhinestoneAccount.ts`, `src/hooks/useZeroDevSocialAccount.ts` |
| Portfolio view | Cross-chain balance display from Rhinestone orchestrator | `src/hooks/useRhinestoneAccount.ts`, `src/app/page.tsx` |
| DCA form | Amount, interval, activate/pause, execution history display | `src/app/page.tsx` |
| TypeScript declarations | `<appkit-button>` web component type | `src/global.d.ts` |

**Key dependencies:** `@reown/appkit`, `@reown/appkit-adapter-wagmi`, `wagmi`, `@tanstack/react-query`, `@rhinestone/sdk`

#### 3.1.2 Backend API Routes

| Route | Method | Purpose | Auth |
|-------|--------|---------|------|
| `/api/dca/execute` | POST | CRE-triggered DCA swap execution | Bearer token (CRE_BACKEND_AUTH_TOKEN) |
| `/api/dca/strategy` | GET | Load DCA position by smart account address | None (public read) |
| `/api/dca/strategy` | POST | Save/update DCA position | None (client-authenticated via AppKit) |
| `/api/orchestrator/[...path]` | GET, POST | Rhinestone API proxy (injects server-side API key) | None (proxied key) |
| `/api/cre/simulate` | POST | Local CRE workflow simulation (dev only) | Blocked unless `ALLOW_CRE_SIMULATE=true` |
| `/auth/google/login` | GET | Google OIDC login initiation | None |
| `/auth/google/callback` | GET | Google OIDC callback + session creation | PKCE + state |
| `/auth/login` | GET | Provider-aware login entrypoint | None |
| `/auth/logout` | POST | Session invalidation | Session cookie |
| `/auth/me` | GET | Current user profile + wallet status | Session cookie |
| `/auth/provider` | GET | Active auth provider metadata | None |

**Implementation files:**

| File | Purpose |
|------|---------|
| `src/app/api/dca/execute/route.ts` | CRE → backend DCA execution endpoint |
| `src/app/api/dca/strategy/route.ts` | DCA position CRUD API |
| `src/app/api/orchestrator/[...path]/route.ts` | Rhinestone orchestrator proxy |
| `src/app/api/cre/simulate/route.ts` | Dev-only CRE simulation bridge |
| `src/app/auth/google/login/route.ts` | Google OIDC login |
| `src/app/auth/google/callback/route.ts` | Google OIDC callback + wallet provisioning |
| `src/app/auth/login/route.ts` | Provider-aware login router |
| `src/app/auth/logout/route.ts` | Session termination |
| `src/app/auth/me/route.ts` | User profile endpoint |
| `src/app/auth/provider/route.ts` | Auth provider metadata |

#### 3.1.3 Auth Provider Architecture (Dual-Plane)

Two independent provider planes with facade pattern:

**Auth Providers** (identity + session):

| Provider | Server Session | Client Login | Unified Wallet | Status |
|----------|---------------|--------------|----------------|--------|
| `google_oidc` | Yes | No | No | Implemented |
| `zerodev_social` | No | Yes | Yes | Implemented |
| `walletconnect` | No | Yes | Yes | Placeholder |
| `reown_appkit` | No | Yes | Yes | Implemented (active default) |
| `privy` | No | Yes | Yes | Implemented |

**Smart Account Providers** (wallet provisioning + UserOp):

| Provider | Server Provisioning | UserOp Submission | Status |
|----------|--------------------|--------------------|--------|
| `zerodev` | Yes | Yes | Implemented |
| `walletconnect` | No | Yes | Placeholder |
| `reown_appkit` | No | Yes (client-side) | Implemented (active default) |
| `privy` | No | Yes (client-side) | Implemented |

**Implementation files:**

| File | Purpose |
|------|---------|
| `src/lib/auth/providers/types.ts` | `IAuthProviderAdapter` interface |
| `src/lib/auth/providers/registry.ts` | Registry + `AuthFacade` |
| `src/lib/auth/providers/setup.ts` | Auto-registration at startup |
| `src/lib/auth/providers/adapters/google-oidc.ts` | Google OIDC adapter |
| `src/lib/auth/providers/adapters/zerodev-social.ts` | ZeroDev social adapter |
| `src/lib/auth/providers/adapters/walletconnect.ts` | WalletConnect placeholder |
| `src/lib/auth/providers/adapters/reown-appkit.ts` | Reown AppKit adapter |
| `src/lib/auth/providers/adapters/privy.ts` | Privy adapter |
| `src/lib/wallet/providers/types.ts` | `ISmartAccountProviderAdapter` interface |
| `src/lib/wallet/providers/registry.ts` | Registry + `SmartAccountFacade` |
| `src/lib/wallet/providers/setup.ts` | Auto-registration at startup |
| `src/lib/wallet/providers/adapters/zerodev.ts` | ZeroDev smart account adapter |
| `src/lib/wallet/providers/adapters/walletconnect.ts` | WalletConnect placeholder |
| `src/lib/wallet/providers/adapters/reown-appkit.ts` | Reown AppKit smart account adapter |
| `src/lib/wallet/providers/adapters/privy.ts` | Privy smart account adapter |

**Selection:** `AUTH_PROVIDER` and `SMART_ACCOUNT_PROVIDER` env vars. Current active: `reown_appkit` for both.

#### 3.1.4 Wallet & Session Key Layer

| File | Purpose |
|------|---------|
| `src/lib/wallet/rhinestone-sessions.ts` | Session key creation + DCA policies (spending-limits, time-frame) |
| `src/lib/wallet/config.ts` | Wallet environment config and validation |
| `src/lib/wallet/provisioning.ts` | `ensureSmartAccountForUser` (Google OIDC path) |
| `src/lib/wallet/userops.ts` | UserOp build/submit/wait helpers |
| `src/lib/wallet/index.ts` | Module barrel exports |

**Session key model:**
- Backend signer (`BACKEND_SIGNER_PRIVATE_KEY`) holds a scoped session key
- Permissions: `approve` on USDC + `exactInputSingle` on SwapRouter02
- Policies: spending-limits (1000 USDC default), time-frame (30 days default)
- User enables once with a single on-chain signature

#### 3.1.5 Database Layer

| File | Purpose |
|------|---------|
| `src/lib/db/postgres.ts` | PostgreSQL pool, `query()` helper, auto-init schema |
| `src/lib/auth/store.ts` | User, session, auth-flow, smart-account-linkage store methods |
| `src/lib/dca/store.ts` | DCA position CRUD (upsert, getDuePositions, markExecuted) |

**Tables (auto-created at runtime):**

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `users` | `sub` (PK) | User identity from OIDC provider |
| `sessions` | `session_id` → `user_sub` | Server-side session store |
| `auth_flows` | `state` (PK) | Transient OIDC flow context (PKCE, nonce) |
| `smart_account_linkages` | (`user_sub`, `chain_id`, `provider`) UNIQUE | Wallet ↔ user binding |
| `dca_positions` | (`smart_account_address`, `smart_account_provider`) UNIQUE | DCA strategy per smart account stack |

Provider-scoping update:
- `dca_positions` now includes `smart_account_provider` (`reown_appkit`, `privy`, or `zerodev`)
- Unique key is `(smart_account_address, smart_account_provider)` so strategies do not collide across account stacks
- `/api/dca/execute` only executes due positions matching the active execution provider
- `dca_positions` includes `zerodev_permission_account` for serialized ZeroDev permission/session-key payloads

#### 3.1.6 Contract Constants

| Constant | Address | Network |
|----------|---------|---------|
| USDC | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Ethereum Sepolia |
| WETH | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` | Ethereum Sepolia |
| Uniswap V3 SwapRouter02 | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` | Ethereum Sepolia |
| Chainlink ETH/USD feed | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | Ethereum Sepolia |

File: `src/lib/constants/networks.ts` (active network: `ETH_SEPOLIA`)

---

### 3.2 CRE Workflow (`cre/`)

**Runtime:** Chainlink Runtime Environment (CRE) — QuickJS WASM on DON nodes  
**Package manager:** bun (for local dev/build)  
**Start:** `cd cre/dca-workflow && npm run start`  
**Simulate:** `cre workflow simulate dca-workflow --target staging-settings`

#### 3.2.1 Workflow Logic

| Step | CRE Capability | What Happens |
|------|---------------|--------------|
| 1. Trigger | `CronCapability` | Cron fires on configurable schedule |
| 2. Read price | `EVMClient.callContract()` | Reads Chainlink ETH/USD `latestRoundData()` with BFT consensus |
| 3. Check freshness | Local logic | Skip if price data older than `minPriceFeedFreshnessSeconds` |
| 4. Retrieve secrets | `runtime.getSecret()` | Gets `BACKEND_AUTH_TOKEN` and `BACKEND_URL` |
| 5. POST to backend | `HTTPClient.sendRequest()` | POSTs execution params via `runInNodeMode` with `cacheSettings` |

**Implementation files:**

| File | Purpose |
|------|---------|
| `cre/dca-workflow/main.ts` | Workflow handler (trigger → read → post) |
| `cre/dca-workflow/config.staging.json` | Staging config (schedule, price feed, slippage) |
| `cre/dca-workflow/config.production.json` | Production config |
| `cre/dca-workflow/workflow.yaml` | Workflow settings (paths, targets) |
| `cre/dca-workflow/package.json` | Dependencies (`@chainlink/cre-sdk`, `viem`, `zod`) |
| `cre/project.yaml` | CRE project settings (RPCs per target) |
| `cre/secrets.yaml` | Secret name → env var mapping (safe to commit) |
| `cre/.env.example` | Required env vars template |
| `cre/.env` | Actual secrets (gitignored) |

#### 3.2.2 Configuration Schema

```json
{
  "schedule": "0 */5 * * * *",
  "priceFeedAddress": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  "priceFeedChainSelectorName": "ethereum-testnet-sepolia-base-1",
  "maxSlippageBps": 50,
  "minPriceFeedFreshnessSeconds": 300
}
```

Per-user DCA config (amount, active/paused) lives in the backend database, not in CRE config.

#### 3.2.3 Secrets

| Secret | Purpose | Storage |
|--------|---------|---------|
| `BACKEND_AUTH_TOKEN` | Bearer token for CRE → backend auth | Vault DON (deployed) / `.env` (local) |
| `BACKEND_URL` | Backend base URL | Vault DON (deployed) / `.env` (local) |

#### 3.2.4 Double-Execution Prevention

| Layer | Mechanism |
|-------|-----------|
| CRE | `cacheSettings` ensures single POST across DON nodes |
| Backend | In-memory idempotency store keyed by `executionId` |
| Database | Interval check (`now - last_executed_at >= interval_seconds`) |

---

### 3.3 Database (PostgreSQL)

**Connection:** `DATABASE_URL` env var  
**SSL:** Optional via `DATABASE_SSL=true`  
**Schema init:** Auto-created at first query (runtime bootstrap)

The PostgreSQL instance serves as the single source of truth for:
- User identity and sessions (OIDC-based)
- Smart account ↔ user linkages
- DCA positions and execution history

See section 3.1.5 for table details.

---

### 3.4 External Services

| Service | Role | Integration Point |
|---------|------|-------------------|
| **Reown AppKit** | Social login, embedded wallets, WalletConnect | Client-side SDK (`<appkit-button>`, wagmi hooks) |
| **Rhinestone** | ERC-7579 smart accounts, cross-chain portfolio, session keys, intent-based tx execution | SDK on client (`useRhinestoneAccount`) + backend (`/api/dca/execute`), orchestrator proxied via `/api/orchestrator` |
| **Chainlink CRE** | Decentralized automation (cron + consensus-verified EVM reads + HTTP) | CRE workflow (`cre/dca-workflow/main.ts`) deployed to DON |
| **Chainlink Price Feeds** | ETH/USD price with consensus | EVM read in CRE workflow (Ethereum Sepolia) |
| **Uniswap V3** | USDC → WETH token swap | SwapRouter02 `exactInputSingle` on Ethereum Sepolia |
| **Google OIDC** | Server-side authentication (legacy path) | Auth routes (`/auth/google/*`) |

---

### 3.5 Monitoring (Planned)

**Status:** Not implemented

**To define:**
- Metrics: DCA executions (success/fail rate, latency), CRE trigger reliability, session key expiry tracking
- Alerts: execution failures, stale price feeds, low USDC balance, session key approaching expiry
- Logs: structured logging for DCA execution pipeline, CRE workflow logs
- Dashboard: execution history, portfolio performance, system health
- Incident response: ownership, escalation paths, runbooks

---

## 4. Environment Variables

### 4.1 Web Application (`web/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_REOWN_PROJECT_ID` | Reown mode only | Reown/WalletConnect Cloud project ID (`AUTH_PROVIDER=reown_appkit`) |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy mode only | Privy App ID (`AUTH_PROVIDER=privy`) |
| `NEXT_PUBLIC_PRIVY_CHAIN_ID` | No | Optional chain override for Privy mode |
| `NEXT_PUBLIC_PRIVY_RPC_URL` | No | Optional RPC URL override for Privy wagmi transport |
| `RHINESTONE_API_KEY` | Yes | Rhinestone orchestrator API key (server-side only) |
| `BACKEND_SIGNER_PRIVATE_KEY` | Yes | Backend signer private key for session key DCA execution |
| `CRE_BACKEND_AUTH_TOKEN` | Yes | Token CRE uses to authenticate with backend |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SESSION_SECRET` | Yes (prod) | Cookie signing secret |
| `GOOGLE_OAUTH_CLIENT_ID` | Google path | Google OIDC client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google path | Google OIDC client secret |
| `AUTH_PROVIDER` | No | Auth provider selection (default: `reown_appkit`) |
| `SMART_ACCOUNT_PROVIDER` | No | Smart account provider (default: `reown_appkit`) |
| `DCA_EXECUTION_PROVIDER` | No | Execution engine override (`rhinestone` or `zerodev`); defaults from `SMART_ACCOUNT_PROVIDER` |
| `DATABASE_SSL` | No | Set `true` for managed Postgres requiring TLS |
| `APP_BASE_URL` | No | Override base URL (defaults to request origin) |
| `ALLOW_CRE_SIMULATE` | No | Enable local CRE simulation endpoint |
| `ENABLE_SMART_ACCOUNT_PROVISIONING` | No | Feature flag for server-side wallet provisioning |
| `NEXT_PUBLIC_APPKIT_CHAIN_ID` | No | AppKit chain ID override |

### 4.2 CRE Workflow (`cre/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `BACKEND_AUTH_TOKEN_ALL` | Yes | Bearer token for backend auth (maps to `BACKEND_AUTH_TOKEN` secret) |
| `BACKEND_URL_ALL` | Yes | Backend base URL (maps to `BACKEND_URL` secret) |

---

## 5. Security Model

### 5.1 Authentication

- **Primary paths:** Reown AppKit or Privy social login (non-custodial embedded wallets, client-side)
- **Legacy path:** Google OIDC Authorization Code + PKCE (server-side token exchange)
- **Session cookies:** HTTP-only, same-site lax, HMAC-signed with constant-time verification
- **Open redirect prevention:** `returnTo` sanitized to same-origin relative paths (blocks protocol-relative, absolute, and control-character normalization attacks)

### 5.2 Authorization

- **CRE → Backend:** Bearer token with constant-time comparison (`CRE_BACKEND_AUTH_TOKEN`)
- **Session keys:** Scoped to specific contract calls (approve + exactInputSingle), spending-limited, time-bounded
- **Rhinestone API key:** Never exposed to browser; proxied via `/api/orchestrator`

### 5.3 Key Management

- **Backend signer private key:** Environment variable, used for session key DCA execution
- **CRE secrets:** Stored in Vault DON for deployed workflows; `.env` for local simulation
- **User wallet keys:** Managed by Reown AppKit (non-custodial); server never has access

### 5.4 Known Security Considerations

- Session key model is experimental (Rhinestone Smart Sessions API may change)
- In-memory idempotency store is lost on server restart (production needs Redis/DB)
- Schema auto-initialization at runtime; dedicated migration system pending
- No rate limiting on public API endpoints

---

## 6. Failure Handling

### 6.1 CRE Workflow Failures

| Scenario | Behavior |
|----------|----------|
| Price feed stale | Skip execution, log, retry on next cron |
| Backend unreachable | HTTP timeout, skip, retry on next cron |
| Backend 400 | Log misconfiguration, skip |
| Backend 409 | Idempotency hit, treat as success |
| Backend 500 | Log, skip, retry on next cron |
| DON node failures | BFT consensus tolerates minority failures (2f+1 honest nodes) |

### 6.2 Backend Failures

| Scenario | Behavior |
|----------|----------|
| Missing env vars | Fail fast with descriptive error |
| DB connection failure | PostgreSQL pool error listener prevents crashes; retry on next request |
| Rhinestone SDK error | Per-position try/catch; error recorded in DB, other positions continue |
| Swap revert (Uniswap) | Error captured, recorded in `dca_positions.last_execution_error` |
| Duplicate execution | In-memory idempotency + DB interval check prevent double-spend |

---

## 7. Testing Strategy

### 7.1 Current Test Coverage

| Area | Tests | Files |
|------|-------|-------|
| Auth redirect sanitization | Unit tests for open redirect prevention | `src/lib/auth/return-to.test.ts` |
| Auth provider config | Unit tests for parser and fallback | `src/lib/auth/provider.test.ts` |
| Google OIDC init retry | Unit tests for transient failure retry | `src/lib/auth/google-oidc.test.ts` |
| PostgreSQL init retry | Unit tests for transient DB failure recovery | `src/lib/db/postgres.test.ts` |
| Wallet provisioning | Unit tests for idempotency and failure recovery | `src/lib/wallet/provisioning.test.ts` |
| Wallet store | Unit tests for CRUD and constraints | `src/lib/wallet/store.test.ts` |

### 7.2 Test Gaps (To Address)

- End-to-end CRE workflow simulation (`cre workflow simulate`)
- DCA execution endpoint integration tests
- Session key creation and validation tests
- Rhinestone SDK integration tests
- Frontend component tests
- Uniswap V3 pool liquidity verification on Ethereum Sepolia

**Test runner:** Vitest (configured in `web/vitest.config.ts`)

---

## 8. Deployment & Operations

### 8.1 Environments

| Aspect | Staging | Production |
|--------|---------|------------|
| CRE schedule | Every 30 seconds | Every 5 minutes (or hourly) |
| Chain | Ethereum Sepolia | Ethereum mainnet (future) |
| Price feed | Ethereum Sepolia testnet | Mainnet Chainlink feed |
| Backend URL | localhost / staging URL | Production URL |
| Token addresses | Testnet USDC/WETH | Mainnet tokens |

### 8.2 Deployment Pipeline (Not Yet Implemented)

- CI/CD pipeline not documented
- Database migrations not formalized (runtime auto-init)
- CRE workflow deployment: `cre workflow deploy` (not yet executed)
- Secret management: `cre secrets create` for Vault DON (not yet configured)

### 8.3 Operational Runbooks

| Runbook | Location |
|---------|----------|
| ZeroDev smart account setup | `docs/runbooks/zerodev-smart-account-setup.md` |

---

## 9. Known Gaps & Future Work

### 9.1 Production Readiness Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| In-memory idempotency store | Lost on restart → duplicate executions possible | High |
| No job queue for nonce management | Concurrent user executions may conflict | High |
| Schema auto-init (no migrations) | Risk of drift in production | Medium |
| No rate limiting | Public API endpoints vulnerable to abuse | Medium |
| No monitoring/alerting | Blind to failures in production | High |
| CRE simulation not verified | End-to-end path untested | High |
| Uniswap V3 pool liquidity unverified | Swaps may fail on Ethereum Sepolia | Medium |

### 9.2 Planned Future Work

| Item | Description | Phase |
|------|-------------|-------|
| Hybrid CRE execution | Move signing into CRE WASM runtime (eliminate backend from hot path) | 10 |
| Multi-token pairs | User-selectable token pairs beyond USDC→ETH | Future |
| Conditional strategies | Limit orders, AI-driven timing, multi-leg strategies | Future |
| Production deployment | Mainnet tokens, production CRE DON, managed database | Future |
| Monitoring stack | Metrics, alerts, dashboards, incident response | Future |

### 9.3 Key Technical Questions

1. **Does viem noble-curves secp256k1 work in CRE's QuickJS WASM runtime?** — Determines if Phase 10 hybrid execution is feasible
2. **Uniswap V3 USDC/WETH pool on Ethereum Sepolia** — Needs testnet liquidity verification
3. **Rhinestone Smart Sessions stability** — Experimental API; track for breaking changes

---

## 10. Agent Notes

### 10.1 Before Making Changes

1. Read `docs/architecture.md` and the relevant spec in `specs/` before editing code
2. If no spec exists for your area, create or extend the nearest stub first
3. For multi-file changes, create a plan in `docs/plans/active/`

### 10.2 After Making Changes

1. Update `TODO.md` to reflect progress
2. Update the relevant spec file in `specs/`
3. Update `docs/quality.md` if quality posture changed
4. Update `docs/architecture.md` if architecture changed
5. Update this specification if system boundaries or data flows changed

### 10.3 Code Conventions

- **Auth provider switching:** Use `AUTH_PROVIDER` and `SMART_ACCOUNT_PROVIDER` env vars; never hardcode providers
- **Secrets:** Never commit `.env` files; use `.env.example` for templates; `cre/secrets.yaml` is a mapping file (safe to commit)
- **Database:** Tables auto-init at runtime; use `query()` from `src/lib/db/postgres.ts`
- **Session keys:** Backend signer is NOT the account owner — it holds a scoped session key the user pre-authorized
- **CRE workflow:** `runInNodeMode` for node-level execution (HTTP POST, secrets); `runtime` level for consensus operations (EVM read)
- **Rhinestone SDK:** Use manual prepare → sign → submit flow (not `sendTransaction()`) for session key signers

### 10.4 Common Pitfalls

- The Rhinestone orchestrator proxy (`/api/orchestrator`) must inject the API key header — never expose `RHINESTONE_API_KEY` to the client
- CRE `cacheSettings` is critical for single-execution across DON nodes — do not remove
- The `getDuePositions()` query uses `EXTRACT(EPOCH FROM ...)` — be careful with timezone-sensitive testing
- ZeroDev social login is sensitive to external project/domain configuration; check Reown dashboard if login fails
- The `exactInputSingle` ABI uses a tuple parameter — ensure correct Solidity struct encoding

### 10.5 File Organization

```
defipanda/
├── AGENTS.md                          # Agent entry point and project map
├── TODO.md                            # Phase-by-phase task tracking
├── docs/
│   ├── architecture.md                # Living architecture document
│   ├── core-beliefs.md                # Project principles
│   ├── quality.md                     # Quality scorecard
│   ├── plans/active/                  # Active implementation plans
│   ├── plans/completed/               # Completed plans archive
│   └── runbooks/                      # Operational runbooks
├── specs/
│   ├── README.md                      # Spec index
│   ├── system-specification.md        # THIS FILE — master specification
│   ├── web-app.md                     # Web app detailed spec
│   ├── cre-workflows.md              # CRE workflow detailed spec
│   ├── monitoring.md                  # Monitoring spec (stub)
│   └── testing-strategy.md           # Testing approach
├── web/                               # Next.js application
│   └── src/
│       ├── app/                       # Pages + API routes
│       ├── config/                    # AppKit/Wagmi config
│       ├── context/                   # React context providers
│       ├── hooks/                     # Custom hooks (Rhinestone)
│       └── lib/                       # Core libraries
│           ├── auth/                  # Auth system + provider adapters
│           ├── constants/             # On-chain addresses and ABIs
│           ├── db/                    # PostgreSQL connection + queries
│           ├── dca/                   # DCA position store
│           └── wallet/               # Wallet system + provider adapters
├── cre/                               # Chainlink CRE project
│   ├── project.yaml                   # CRE project settings
│   ├── secrets.yaml                   # Secret name → env var mapping
│   └── dca-workflow/                  # DCA workflow implementation
│       ├── main.ts                    # Workflow handler
│       ├── config.staging.json        # Staging config
│       ├── config.production.json     # Production config
│       └── workflow.yaml              # Workflow targets
└── .cursor/
    ├── rules/                         # Cursor agent rules
    └── skills/                        # Agent skills (CRE reference docs)
```
