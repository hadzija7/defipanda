# TODO

## Phase 1 - Architecture Baseline
- [x] Create initial architecture map
- [x] Create agent workflow scaffold and rules
- [x] Add local web-to-CRE simulation bridge for end-to-end test flow
- [ ] Confirm system boundaries (web vs CRE vs monitoring)
- [x] Confirm persistence approach for strategy state (PostgreSQL `dca_positions` table)

## Phase 2 - Spec Pass (Light)
- [ ] Fill `specs/web-app.md` with core flows and contracts
- [ ] Fill `specs/cre-workflows.md` with runtime behavior and failure modes
- [ ] Fill `specs/monitoring.md` with telemetry and alert model

## Phase 3 - First Implementation Slice
- [ ] Pick one end-to-end vertical slice (UI -> CRE -> status visibility)
- [ ] Implement and verify with tests
- [ ] Update `docs/quality.md` based on evidence
- [x] Implement Phase 1 Google OAuth2/OIDC login flow in `web/` (no wallet creation yet)
- [x] Add PostgreSQL-backed auth/session persistence for web OAuth flow
- [x] Harden OAuth `returnTo` redirect handling to prevent open redirects + add unit tests
- [x] Close tab-normalization open-redirect gap in OAuth `returnTo` sanitization (`\t` bypass)
- [x] Fix one-time init cache poisoning in DB schema/OIDC discovery (retry after transient startup failures)
- [x] Use constant-time HMAC digest verification for signed auth cookies (`timingSafeEqual`) to avoid timing side-channel leaks
- [x] Add PostgreSQL pool idle-client `error` listener to prevent unhandled EventEmitter crashes on transient DB/backend failures

## Phase 4 - Auth Stage 2 (ZeroDev Smart Accounts)
- [x] Finalize Stage 2 planning artifact in `docs/plans/active/zerodev-auth-stage2-plan.md`.
- [x] Extend `specs/web-app.md` with Stage 2 architecture:
  - OAuth `sub` to smart-account ownership mapping
  - backend ownership of provisioning and UserOp orchestration
  - persistence contract and provisioning lifecycle states
- [x] Add wallet persistence schema + store methods:
  - unique key on (`user_sub`, `chain_id`, `provider`)
  - `smart_account_address`, `provisioning_status`, `last_error`
- [x] Add `web/src/lib/wallet/` module skeleton:
  - `provisioning.ts` (`ensureSmartAccountForUser`)
  - `userops.ts` (`buildUserOp`, `submitUserOp`, `waitForUserOpReceipt`)
- [x] Add backend wallet stack baseline (Viem + ZeroDev SDK) and environment validation.
- [x] Implement idempotent create-or-load provisioning flow with retry-safe status transitions.
- [x] Wire Stage 2 hook into OAuth callback while preserving login success on provisioning failure.
- [x] Expose wallet provisioning status in auth profile endpoint for frontend UX and support.
- [x] Add tests:
  - unit: provisioning idempotency + failure recovery
  - integration: callback path with resilient session behavior
- [x] Add runbook docs for ZeroDev setup, required secrets, and troubleshooting.
- [x] Rollout controls:
  - `ENABLE_SMART_ACCOUNT_PROVISIONING` feature flag
  - canary targeting + observability + rollback checklist
- [x] Wire frontend UI to display smart account address, status, chain, and provider for authenticated users.

## Phase 5 - Auth Stage 3 (Modular Provider Switching)
- [x] Add provider selection module with `AUTH_PROVIDER` config (`google_oidc` default, `zerodev_social` optional).
- [x] Add provider metadata endpoint (`GET /auth/provider`) for frontend branching.
- [x] Add provider-aware login entrypoint (`GET /auth/login`) to centralize switching logic.
- [x] Keep Google callback provisioning hook active only for Google provider mode.
- [x] Extend `/auth/me` response with active `authProvider`.
- [x] Update frontend auth UX to branch login/logout behavior by provider.
- [x] Add unit tests for auth provider config parser and fallback behavior.
- [x] Resolve `@magic-sdk/*` export mismatch by pinning compatible `@magic-sdk/types`, and re-enable ZeroDev social login/logout runtime calls.
- [x] Stabilize ZeroDev social OAuth callback URL to a deterministic origin path and add client-side error diagnostics for login failures.

## Phase 6 - Modular Provider Architecture (Full)
- [x] Define auth and smart-account provider interfaces (`IAuthProviderAdapter`, `ISmartAccountProviderAdapter`).
- [x] Create provider registries and facade modules (`AuthFacade`, `SmartAccountFacade`).
- [x] Implement Google OIDC auth adapter with server-session capabilities.
- [x] Implement ZeroDev social auth adapter with client-login capabilities.
- [x] Implement ZeroDev smart account adapter wrapping existing provisioning/userops.
- [x] Add WalletConnect placeholder adapters for auth and smart account planes.
- [x] Update routes (`/auth/login`, `/auth/provider`, `/auth/me`) to use facades.
- [x] Update Google callback to use facades for capability-driven provisioning.
- [x] Update frontend UI to use capability-driven auth branching.
- [x] Update specs and architecture docs to reflect dual-plane provider model.
- [x] Add `unifiedWalletAuth` capability for providers that handle both auth AND wallet in one flow.
- [x] Add `linkedSmartAccountProvider` to auth adapters for unified wallet providers.
- [x] Update ZeroDev Social and WalletConnect adapters with unified wallet capability.
- [x] Update frontend to display unified wallet status for client-side auth sessions.

## Phase 7 - Reown AppKit Integration (Social Login + Smart Accounts)
- [x] Install Reown AppKit dependencies (`@reown/appkit`, `@reown/appkit-adapter-wagmi`, `wagmi`, `@tanstack/react-query`).
- [x] Create AppKit Wagmi adapter config (`web/src/config/index.tsx`) with SSR cookie storage.
- [x] Create AppKit context provider (`web/src/context/index.tsx`) with social login features enabled.
- [x] Add `reown_appkit` auth provider adapter implementing `IAuthProviderAdapter` with `unifiedWalletAuth` capability.
- [x] Add `reown_appkit` smart account provider adapter implementing `ISmartAccountProviderAdapter` (client-side wallet).
- [x] Register both adapters in setup modules and update type unions, registries, and barrel exports.
- [x] Update root layout to wrap app in `AppKitProvider` with SSR cookie hydration.
- [x] Add `WalletProviderRoot` runtime gate so AppKit/Wagmi mounts only when `AUTH_PROVIDER=reown_appkit`.
- [x] Add TypeScript global declarations for `<appkit-button>` web component.
- [x] Update frontend page to show `<appkit-button>` when `AUTH_PROVIDER=reown_appkit` and display connected wallet info.
- [x] Update docs: architecture, quality scorecard, README, and specs.

## Phase 8 - Rhinestone Smart Account + Session Keys Integration
- [x] Install `@rhinestone/sdk` dependency.
- [x] Create Rhinestone orchestrator proxy route (`/api/orchestrator/[...path]`) to keep API key server-side.
- [x] Create `useRhinestoneAccount` hook wrapping Reown walletClient into Rhinestone ERC-7579 smart account.
- [x] Update frontend page to display Rhinestone smart account address and cross-chain portfolio.
- [x] Create session key module (`web/src/lib/wallet/rhinestone-sessions.ts`) with DCA-scoped policies (spending-limits, time-frame).
- [x] Create backend DCA execution endpoint (`/api/dca/execute`) using Rhinestone session keys.
- [x] Update Reown AppKit smart account adapter to reflect Rhinestone SDK integration.
- [x] Update docs: architecture, quality scorecard, and TODO.

## Phase 9 - DCA Execution Pipeline (CRE Smart Trigger + Backend Executor)
- [x] Upgrade CRE workflow from hello-world to smart trigger:
  - Zod config schema (priceFeedAddress, priceFeedChainSelectorName, maxSlippageBps, minPriceFeedFreshnessSeconds)
  - EVM Read: Chainlink ETH/USD `latestRoundData()` with DON consensus on Ethereum Sepolia
  - Price staleness check (skip if older than minPriceFeedFreshnessSeconds)
  - HTTP POST to backend `/api/dca/execute` with consensus-verified params via `runInNodeMode`
  - `cacheSettings` for single-execution across DON nodes
  - Bearer token auth from CRE secrets
- [x] Add CRE secrets configuration:
  - `secrets.yaml` with `BACKEND_AUTH_TOKEN` and `BACKEND_URL`
  - `.env` updated with simulation values
  - `workflow.yaml` secrets-path pointed to `../secrets.yaml`
- [x] Update `/api/dca/execute` endpoint:
  - Bearer token authentication with constant-time comparison
  - Accepts CRE-verified params (consensusPrice, maxSlippageBps, executionTimestamp)
  - DB-based dedup via `getDuePositions()` interval check (in-memory idempotency removed)
  - Uniswap V3 SwapRouter02 `exactInputSingle` swap encoding (USDC→WETH)
  - Iterates all active DCA strategies per execution
  - USDC balance pre-check per position (skip gracefully on insufficient funds)
  - Testnet-safe `amountOutMinimum=0` (oracle/pool price divergence on Sepolia)
  - Rhinestone SDK error context captured in logs and stored error messages
  - Modular execution engine switch via env (`DCA_EXECUTION_PROVIDER`: `rhinestone` | `zerodev`)
  - Provider-scoped due-position execution (`smart_account_provider`)
  - ZeroDev permissions path: deserialize/execute stored permission accounts for social-owned Kernel wallets
- [x] Update session key permissions (`rhinestone-sessions.ts`):
  - `approve` on input token for DEX router
  - `exactInputSingle` on Uniswap V3 SwapRouter02
  - Spending-limit policy (deterministic, no time-frame — avoids non-deterministic session hash)
- [x] Implement Smart Sessions enable flow (fix "Bundle simulation failed"):
  - Root cause: session key was never authorized by account owner → orchestrator simulation rejected
  - Frontend: `experimental_getSessionDetails` + `experimental_signEnableSession` on DCA activation
  - DB: `session_enable_signature` + `session_hashes_and_chain_ids` columns on `dca_positions`
  - Backend: passes `enableData` (user signature + hashes) in every `prepareTransaction` call
  - Session definition is deterministic: frontend uses address, backend uses private key, same hash
  - `NEXT_PUBLIC_BACKEND_SIGNER_ADDRESS` env var exposes backend signer address to frontend
- [x] Fix account deployment + session enable (atomic):
  - Root cause: Rhinestone smart account was counterfactual only (not deployed on-chain)
  - Frontend DCA activation now uses `rhinestoneAccount.sendTransaction({ sponsored: true })` with `experimental_enableSession()` to atomically deploy the account and install the session on-chain
  - Separate `deployAccount()` / `isAccountDeployed()` functions removed; orchestrator handles deployment as part of the first sponsored intent
- [x] Fix DCA backend execution (session-key swap via orchestrator):
  - Root cause: SDK `waitForExecution` returns at PRECONFIRMED status before the filler finishes; our code treated the early return as a completed (empty) fill
  - Fix: custom `waitForIntentFill` polls `getIntentOpStatus` until COMPLETED/FILLED/FAILED/EXPIRED (up to 120s), extracting `fillTransactionHash`
  - `sponsored: true` is required for session-key intents; without it, the non-sponsored routing uses Permit2/Paymaster calls that don't match session permissions, and the filler never executes
  - Verified on-chain: Uniswap V3 swap (USDC→WETH) executed successfully through Rhinestone orchestrator with session key authorization
- [x] Add contract address constants (network-switchable `web/src/lib/constants/networks.ts`):
  - Ethereum Sepolia active: USDC, WETH, Uniswap V3 SwapRouter02, Chainlink ETH/USD price feed
  - Base Sepolia config retained for easy switching
  - SwapRouter02 ABI and Chainlink price feed ABI
- [x] Build simplified single-page UI:
  - Smart account wallet view (Rhinestone address, status)
  - On-chain USDC/WETH balance display (direct contract reads on active chain)
  - Cross-chain portfolio / balance display (Rhinestone aggregated)
  - Balance warning when DCA amount exceeds USDC balance
  - Deposit instructions with Circle faucet link
  - DCA strategy configuration (amount, interval, activate/pause)
  - Explorer link corrected to Ethereum Sepolia etherscan
  - Session grant status exposed to UI: "Grant Session" button when active but session missing
  - Execute endpoint no longer marks session-not-granted positions as executed (retries on next trigger)
  - Non-Reown auth modes now show a provider status screen instead of crashing on missing Reown env
  - `zerodev_social` mode now supports client-side social login + Kernel address derivation + on-chain balance view
  - `privy` mode now supports client-side login/logout, wagmi wallet client wiring, Rhinestone account initialization, and provider-scoped DCA strategy UX
  - Privy mode now prefers the embedded Privy wallet as active wagmi wallet (avoids accidental injected wallet chain-1 binding)
  - Privy chain-id resolution no longer inherits `SMART_ACCOUNT_CHAIN_ID`; it now uses `NEXT_PUBLIC_PRIVY_CHAIN_ID` or `activeNetwork.chainId` to avoid unsupported `wallet_switchEthereumChain` requests
  - ZeroDev login callback URL normalized to `${origin}/`; client transport now prefers `NEXT_PUBLIC_ZERODEV_RPC_URL`
- [x] Create DCA strategy API (DB-backed):
  - `GET /api/dca/strategy?address=0x...` — load position for a smart account
  - `POST /api/dca/strategy` — save/update position (PostgreSQL `dca_positions` table)
  - DCA store module (`web/src/lib/dca/store.ts`) with typed CRUD operations
  - `/api/dca/execute` reads due positions from DB, checks interval + last_executed_at
  - `markExecuted()` updates last_executed_at, tx hash, error, and total_executions
  - DCA positions now include `smart_account_provider` to isolate strategies by account stack
  - DCA strategy now persists `zerodev_permission_account` payload for ZeroDev session-key execution
  - Session-grant requirement now applies to both `reown_appkit` and `privy` provider scopes
- [ ] Simulate end-to-end: `cre workflow simulate dca-workflow --target staging-settings`
- [x] Update docs: architecture, CRE workflows spec, quality scorecard, TODO

## Phase 9.5 - Docker Compose Self-Hosting
- [x] Create `web/Dockerfile` (Next.js standalone build with multi-stage)
- [x] Create `cre/Dockerfile` (Debian + CRE CLI + Bun for workflow deps)
- [x] Create `cre/entrypoint.sh` (loop-based CRE simulation with backend health check)
- [x] Create `docker-compose.yml` (postgres + web + cre-cron)
- [x] Create `.env.docker` template with all required env vars
- [x] Set Next.js `output: "standalone"` in `web/next.config.ts`
- [x] Add root `.gitignore` and `.dockerignore` files
- [x] Update architecture docs with deployment section
- [ ] Test full `docker compose up --build` flow
- [ ] Verify CRE CLI auth works headlessly (CRE_API_KEY)
- [ ] Verify end-to-end: cre-cron → POST /api/dca/execute → Rhinestone swap

## Phase 10 - Hybrid CRE Execution (Experimental)
- [ ] Verify viem noble-curves secp256k1 works in CRE QuickJS WASM runtime
- [ ] If compatible: store session key as CRE secret, sign transactions inside CRE
- [ ] If compatible: submit signed transactions via HTTP POST to RPC (eliminate backend from execution path)
- [ ] If incompatible: document limitations, stay with Phase 9 architecture
