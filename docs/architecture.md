# DefiPanda Architecture (Simple v0)

## Goal
DefiPanda executes an automated DCA strategy using Chainlink CRE, with a web app for control/visibility and monitoring for reliability.

## Confirmed Systems
1. **Web App (`web/`)**
   - Next.js user interface.
   - Primary responsibilities: strategy setup, status display, operator controls, and user authentication session handling.
2. **CRE Workflows (`cre/`)**
   - Workflow and config files for DCA execution.
   - Primary responsibilities: schedule/trigger logic, execution orchestration, environment-specific config.
3. **Monitoring (TBD implementation)**
   - Observability for workflow health and failures.
   - Primary responsibilities: heartbeat checks, error surfacing, execution history signals.

## High-Level Data Flow
1. User configures or updates strategy in the web app.
2. Web layer writes/reads DCA positions in PostgreSQL (`dca_positions` table).
3. CRE workflow executes DCA actions according to configured rules.
4. Monitoring captures execution outcomes and alerts on failure conditions.
5. Web app surfaces status and recent execution outcomes.

## Current Directory Map
- `web/`: Next.js app and server-side API bridge for local CRE simulation.
- `cre/`: CRE project files and `dca-workflow/` implementation.
- `docs/`: project docs and architecture decisions.
- `specs/`: evolving system specs and testing strategy.

## Current Local Test Bridge
- Endpoint: `POST /api/cre/simulate` in `web/`.
- Execution path: frontend button -> Next.js server route -> `cre workflow simulate`.
- Working directory for CLI execution: `../cre` (from the `web/` app).
- Safety: route is blocked in production unless `ALLOW_CRE_SIMULATE=true`.

## Current Auth Bridge (Phase 1)
- Endpoints:
  - `GET /auth/google/login`
  - `GET /auth/google/callback`
  - `POST /auth/logout`
  - `GET /auth/me`
- Protocol: Google OIDC Authorization Code Flow with PKCE, server-side token exchange.
- Identity key: Google `sub` claim.
- Persistence: PostgreSQL-backed user/session/auth-flow tables.

## Planned Auth + Wallet Bridge (Phase 2)
- After successful Google callback, backend triggers smart-account provisioning (`create-or-load`) keyed by `user_sub`.
- One smart account per user per configured chain/provider tuple.
- Login remains resilient: session issuance is not blocked by provisioning failures.
- Backend owns UserOp preparation/submission through a Viem + ZeroDev integration module.
- Browser surfaces wallet provisioning status; it does not submit UserOps directly.

## Auth + Wallet Provider Architecture (Phase 3)
The provider system uses a dual-plane modular architecture with:

### Dual Planes
1. **Auth Providers** (`AuthFacade`) - Identity and session bootstrapping
2. **Smart Account Providers** (`SmartAccountFacade`) - Wallet provisioning and UserOp execution

### Hybrid Orchestration Model
- Server routes handle server-capable providers (Google OIDC)
- Client adapters handle browser-SDK providers (ZeroDev Social, WalletConnect)
- Provider capabilities drive orchestration path selection:
  - `serverSession` / `clientSideLogin` - auth flow type
  - `smartAccountProvisioning` - server-side wallet creation after auth
  - `unifiedWalletAuth` - auth SDK handles both identity AND wallet creation

### Unified Wallet Auth
Providers like ZeroDev Social and WalletConnect have `unifiedWalletAuth: true`:
- Auth and wallet creation happen in a single client-side SDK flow
- No separate server-side provisioning step needed
- Each auth provider declares its `linkedSmartAccountProvider` for UserOp operations

### Reown AppKit Integration (Phase 4 - Auth)
Reown AppKit provides a unified client-side solution for social login + embedded wallets:
- Social login via Google, X, GitHub, Discord, Apple, Facebook, Farcaster
- Email OTP login with non-custodial embedded wallet
- WalletConnect-compatible external wallet connections
- `<appkit-button>` web component for one-click auth modal
- Wagmi adapter for SSR-compatible state management with cookie hydration
- `unifiedWalletAuth: true`: auth and wallet creation happen in a single client-side flow

### Provider Selection
- `AUTH_PROVIDER` env var selects auth provider (`google_oidc` default, `zerodev_social`, `walletconnect`, `reown_appkit`)
- `SMART_ACCOUNT_PROVIDER` env var selects smart account provider (`zerodev` default, `walletconnect`, `reown_appkit`)
- Adapters are registered at startup and resolved through facade APIs

### Extension Points
- New providers implement `IAuthProviderAdapter` or `ISmartAccountProviderAdapter`
- Registration happens in setup modules (`providers/setup.ts`)
- WalletConnect adapters are pre-registered as placeholders for future implementation

### Rhinestone Smart Account + Session Keys (Phase 5 - Wallet)
Rhinestone SDK wraps the Reown AppKit walletClient to provide:
- **ERC-7579 Smart Account**: deterministic address across all supported chains
- **Cross-Chain Portfolio**: unified balance view via Rhinestone orchestrator
- **Session Keys (experimental)**: scoped on-chain permissions for backend DCA execution
  - Backend signer gets a time-limited, spending-capped session key
  - User signs once to enable; backend executes DCA swaps autonomously
  - Policies: `spending-limits` (ERC-20 cap), `time-frame` (expiry)
- **Orchestrator Proxy**: `/api/orchestrator/[...path]` proxies requests to Rhinestone API
  with server-side `RHINESTONE_API_KEY` (never exposed to browser)
- **Backend DCA Endpoint**: `/api/dca/execute` uses session key to submit ERC-20 transfers
  on behalf of the user's Rhinestone smart account

## DCA Execution Pipeline (Phase 9 - Implemented)

### Design: CRE Smart Trigger + Backend Executor

The DCA execution loop combines CRE's decentralized consensus with the backend's
Rhinestone session key custody:

1. **CRE (trigger + intelligence)**: cron fires → EVM read price feed with DON consensus → compute execution params → HTTP POST to backend
2. **Backend (signing + submission)**: validates CRE auth → encodes DEX swap calldata → submits via Rhinestone session key → returns result

### Why This Split
- CRE provides **consensus-verified market data** (multiple nodes agree on price)
- CRE provides **reliable, fault-tolerant scheduling** (DON-level availability)
- Backend provides **session key custody** (private key in secure server environment)
- Backend provides **Rhinestone SDK integration** (requires Node.js runtime)

### CRE Capabilities in Use
| Capability | Purpose |
|------------|---------|
| Cron trigger | Schedule DCA executions |
| EVM Read | Chainlink price feed with consensus |
| HTTP POST | Trigger backend execution (cacheSettings for single-call) |
| Secrets | Backend auth token via Vault DON |

### Execution Scheduling (DB-Backed)
- DCA positions stored in PostgreSQL `dca_positions` table with `interval_seconds` and `last_executed_at`
- On CRE trigger, backend queries `getDuePositions()`: active positions where `now - last_executed_at >= interval_seconds`
- After execution, `markExecuted()` updates `last_executed_at`, `total_executions`, and tx hash/error
- One position per smart account (unique index on `smart_account_address`)

### Double-Execution Prevention
- CRE: `cacheSettings` with short `maxAge` (10s) deduplicates across DON nodes within a single trigger
- DB: `getDuePositions()` interval check (`NOW() - last_executed_at >= interval_seconds`) is the sole dedup mechanism on the backend; `markExecuted()` updates `last_executed_at` immediately after each swap

### Future Evolution Path
After Option B is proven, explore moving signing into CRE itself:
- Store session key as a CRE secret
- Sign transactions in CRE's WASM runtime (viem noble-curves is pure JS)
- Submit signed transactions directly via HTTP to an RPC endpoint
- Eliminates backend from the execution hot path entirely

## Tech Stack (Current)
- Frontend: Next.js + Reown AppKit + Rhinestone SDK
- Smart Accounts: Rhinestone ERC-7579 (wrapping Reown signer)
- Automation runtime: Chainlink CRE
- Auth: Reown AppKit (social login, embedded wallets)
- Monitoring: TBD (tooling not chosen yet)

## Key Unknowns To Resolve Next
1. Does viem crypto (noble-curves secp256k1) work in CRE's QuickJS WASM runtime? (Phase 10)
2. Uniswap V3 USDC/WETH pool liquidity on Ethereum Sepolia — needs testnet verification.
3. Monitoring stack selection and alert channels.
4. Deployment model (environments, secrets handling, promotion flow).
5. Production-grade idempotency store (currently in-memory, needs Redis/DB).
6. Production job queue for sequential nonce management across concurrent users.

## Initial Conventions
- Keep all workflow secrets out of source control.
- Prefer explicit environment-specific config files.
- Treat docs/specs as living artifacts and update them with implementation changes.
