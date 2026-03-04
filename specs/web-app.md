# Web App Spec

Status: In Progress

## Scope (Current)
- Next.js app with a local CRE simulation control surface.
- Phase 1 authentication with Google OAuth2/OIDC (Authorization Code + PKCE).
- Session-backed identity for app routes (wallet provisioning intentionally deferred).

## Auth and Access Model (Phase 1)
### Goals
- Use server-side OIDC flow with PKCE and anti-CSRF state.
- Validate identity token claims (`iss`, `aud`, `exp`, `nonce`) before session issuance.
- Use Google `sub` as the stable internal user identity key.

### Endpoints
- `GET /auth/google/login`
  - Generates PKCE verifier/challenge, state, and nonce.
  - Stores auth flow context in server session store keyed by signed cookie.
  - Sanitizes `returnTo` to same-origin relative paths only (blocks protocol-relative/absolute redirects and slash/control-char normalization tricks, including tab/newline/carriage-return removal by URL parsing).
  - Redirects to Google authorization endpoint.
- `GET /auth/google/callback`
  - Validates state against stored flow session.
  - Exchanges authorization code for tokens.
  - Validates ID token claims and upserts user by `sub`.
  - Re-sanitizes stored `returnTo` before final app redirect as defense-in-depth.
  - Issues app session cookie and redirects back to app.
- `POST /auth/logout`
  - Invalidates app session and clears app session cookie.
- `GET /auth/me`
  - Returns current authenticated user profile from app session.

### Session and User Persistence
- Uses PostgreSQL tables for:
  - OAuth transient flow session (`state`, `nonce`, `code_verifier`, `returnTo`).
  - App session (`sessionId -> userSub`).
  - User record (`sub -> profile fields`).
- Cookies are HTTP-only, same-site lax, and signed with `AUTH_SESSION_SECRET`.
- Signed cookie HMAC verification uses constant-time digest comparison to reduce timing side-channel exposure.
- Current implementation bootstraps tables at runtime if missing.
- Transient bootstrap/discovery failures are retryable: failed first attempts do not poison long-lived process state.
- PostgreSQL pool registers an explicit idle-client `error` listener to avoid process crashes on backend restarts/network interruptions.

## Existing CRE Test Flow
- Page: `web/src/app/page.tsx`
- User action: click "Run CRE simulation"
- Request: `POST /api/cre/simulate`
- Response: JSON payload with command, duration, stdout, stderr, and exit status

## Current Environment Variables (Web)
- `GOOGLE_OAUTH_CLIENT_ID` (required)
- `GOOGLE_OAUTH_CLIENT_SECRET` (required)
- `AUTH_SESSION_SECRET` (required in production)
- `DATABASE_URL` (required)
- `DATABASE_SSL` (optional: set `true` for managed Postgres providers requiring TLS)
- `APP_BASE_URL` (optional, defaults to request origin)
- `ALLOW_CRE_SIMULATE` (existing simulation safety switch)

## Out of Scope for This Phase
- Wallet creation, session-key issuance, or policy binding.
- Role-based authorization and admin access control.

## Current Auth Test Coverage
- Unit tests for redirect target sanitization in `web/src/lib/auth/return-to.test.ts`.
- Unit tests for retry behavior after transient failures in:
  - `web/src/lib/db/postgres.test.ts`
  - `web/src/lib/auth/google-oidc.test.ts`

## Stage 2: ZeroDev Smart Account Integration (Implemented)
Status: Implemented

### Goals
- Provision one ZeroDev smart account per authenticated Google user.
- Keep login resilient: auth success must not depend on immediate wallet provisioning success.
- Establish backend-owned UserOp submission path for future strategy actions.

### Auth-to-Wallet Binding Model
- Identity source of truth remains Google `sub`.
- Wallet linkage key: (`user_sub`, `chain_id`, `provider`).
- Provider value for Stage 2: `zerodev`.
- Initial network: Tenderly Virtualnet (mainnet fork, chain ID 1).

### Callback Behavior (Stage 2 Hook)
- Hook location: after user upsert in `GET /auth/google/callback`.
- Call `ensureSmartAccountForUser(userSub)` from wallet provisioning module.
- Outcomes:
  - `ready`: wallet address persisted and returned in profile metadata.
  - `pending`: transient provisioning in progress (safe to retry).
  - `failed`: session remains valid; error recorded for support/debugging.

### Wallet Persistence Contract
- Add smart account linkage table/fields with:
  - `user_sub`
  - `chain_id`
  - `provider`
  - `smart_account_address`
  - `provisioning_status` (`pending | ready | failed`)
  - `last_error`
  - timestamps
- Enforce uniqueness on (`user_sub`, `chain_id`, `provider`) for idempotency.

### Backend UserOp Stack (Baseline)
- Viem-first chain client and RPC transport.
- ZeroDev SDK for account lifecycle + UserOp helpers.
- Bundler submission through configured ZeroDev RPC endpoint.
- Optional paymaster left out in initial slice (can be introduced after baseline is stable).

### Service Boundaries
- `web` backend owns:
  - account create-or-load
  - persistence updates
  - UserOp build/submit/wait helpers
- Browser app owns:
  - authenticated user UX
  - wallet status presentation/retry trigger only

### Initial API Contracts (Internal)
- `ensureSmartAccountForUser(userSub) -> { status, address?, chainId, error? }`
- `buildUserOp(input) -> unsignedUserOp`
- `submitUserOp(unsignedUserOp) -> userOpHash`
- `waitForUserOpReceipt(userOpHash) -> receipt`

### Environment Variables (Stage 2)
- `ENABLE_SMART_ACCOUNT_PROVISIONING` (feature flag, default: disabled)
- `SMART_ACCOUNT_RPC_URL` (required when enabled, e.g. Tenderly Virtualnet URL)
- `SMART_ACCOUNT_CHAIN_ID` (default: 1)
- `BACKEND_SIGNER_PRIVATE_KEY` (required when enabled, server-managed signer key)
- `ZERODEV_RPC_URL` (optional, bundler RPC; defaults to `SMART_ACCOUNT_RPC_URL`)

### Test Coverage (Stage 2)
- Unit tests in `web/src/lib/wallet/store.test.ts`:
  - Linkage CRUD operations
  - Idempotency constraints
- Unit tests in `web/src/lib/wallet/provisioning.test.ts`:
  - Create-or-load idempotency
  - Failure-to-retry transitions
  - Disabled provisioning path

### Implementation Files (Stage 2)
- `web/src/lib/wallet/config.ts` - Environment config and validation
- `web/src/lib/wallet/provisioning.ts` - `ensureSmartAccountForUser`
- `web/src/lib/wallet/userops.ts` - UserOp build/submit/wait helpers
- `web/src/lib/wallet/index.ts` - Module exports
- `web/src/lib/db/postgres.ts` - Added `smart_account_linkages` table
- `web/src/lib/auth/store.ts` - Added linkage store methods
- `web/src/app/auth/google/callback/route.ts` - Stage 2 provisioning hook
- `web/src/app/auth/me/route.ts` - Wallet status in profile response
- `docs/runbooks/zerodev-smart-account-setup.md` - Operations runbook

## Stage 3: Modular Auth Provider Selection (Full Architecture)
Status: Implemented

### Goals
- Make auth provider switchable without rewriting route-level behavior.
- Preserve existing Google OIDC server session flow as default.
- Add ZeroDev social login integration path for provider-level modularity and UX validation.
- Create a hybrid orchestration model: server routes for server-capable providers, client adapters for client-only flows.
- Separate auth provider and smart account provider concerns into independent planes.
- Prepare extension points for future providers (WalletConnect).

### Provider Architecture

#### Dual-Plane Provider Model
The architecture separates two independent provider planes:
1. **Auth Providers** - Handle identity/session bootstrapping
2. **Smart Account Providers** - Handle provisioning and UserOp execution

Each plane has:
- Provider interface contract (`IAuthProviderAdapter`, `ISmartAccountProviderAdapter`)
- Registry for adapter registration and lookup
- Facade for unified consumer API (`AuthFacade`, `SmartAccountFacade`)
- Setup module for automatic adapter registration

#### Hybrid Orchestration
- Server routes serve as the canonical entrypoint for provider metadata and server-capable flows
- Client-side adapters handle providers requiring browser SDK orchestration
- Provider capabilities define which orchestration path applies:
  - `serverSession: true` → Server-side auth flow
  - `clientSideLogin: true` → Client-side SDK initiation
  - `unifiedWalletAuth: true` → Auth provider also manages wallet creation (no separate provisioning needed)

#### Unified Wallet Auth
Providers with `unifiedWalletAuth: true` handle both authentication AND smart account creation in a single client-side flow:
- The auth SDK creates/connects to a smart account as part of login
- No separate server-side provisioning is needed
- Wallet address is computed deterministically by the SDK
- The auth provider specifies its `linkedSmartAccountProvider` to identify which wallet provider to use for UserOp operations

### Environment Contract
- `AUTH_PROVIDER`:
  - `google_oidc` (default)
  - `zerodev_social`
  - `walletconnect` (registered but not runtime-enabled)
  - `privy`
- `SMART_ACCOUNT_PROVIDER`:
  - `zerodev` (default)
  - `walletconnect` (registered but not runtime-enabled)
  - `privy`
- `NEXT_PUBLIC_ZERODEV_PROJECT_ID` (required when `AUTH_PROVIDER=zerodev_social`)
- `NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER` (optional: `google` default, `facebook`)
- `NEXT_PUBLIC_ZERODEV_CHAIN_ID` (optional: chain ID for ZeroDev social, defaults to `SMART_ACCOUNT_CHAIN_ID` or `1`)
- `NEXT_PUBLIC_ZERODEV_RPC_URL` (recommended for client-side ZeroDev social/bundler transport; falls back to `ZERODEV_RPC_URL`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (required when `AUTH_PROVIDER=walletconnect`)
- `NEXT_PUBLIC_WALLETCONNECT_CHAIN_ID` (optional: chain ID for WalletConnect, defaults to `SMART_ACCOUNT_CHAIN_ID` or `1`)
- `NEXT_PUBLIC_PRIVY_APP_ID` (required when `AUTH_PROVIDER=privy`)
- `NEXT_PUBLIC_PRIVY_CHAIN_ID` (optional: chain ID for Privy mode; defaults to `activeNetwork.chainId` and does not inherit `SMART_ACCOUNT_CHAIN_ID`)
- `NEXT_PUBLIC_PRIVY_RPC_URL` (optional: RPC URL override for Privy Wagmi transport)

### Auth Provider Adapters
| Provider | Server Session | Client Login | Smart Account Provisioning | Unified Wallet Auth |
|----------|----------------|--------------|---------------------------|---------------------|
| `google_oidc` | ✓ | ✗ | ✓ | ✗ |
| `zerodev_social` | ✗ | ✓ | ✗ | ✓ |
| `walletconnect` | ✗ | ✓ | ✗ | ✓ |
| `privy` | ✗ | ✓ | ✗ | ✓ |

### Smart Account Provider Adapters
| Provider | Server Provisioning | UserOp Submission | External Wallet |
|----------|--------------------|--------------------|-----------------|
| `zerodev` | ✓ | ✓ | ✗ |
| `walletconnect` | ✗ | ✓ | ✓ |
| `privy` | ✗ | ✓ (client-side via wagmi) | ✗ |

### Updated Endpoints
- `GET /auth/provider`
  - Returns active provider metadata including capabilities.
  - Response: `{ provider, displayName, capabilities }`
- `GET /auth/login`
  - Delegates to `AuthFacade.initiateLogin()`:
    - Server providers: redirects to provider-specific route
    - Client providers: redirects to app for client-side initiation
- `GET /auth/me`
  - Uses `SmartAccountFacade.getSmartAccountForUser()` for wallet status.
  - Includes `authProvider` from active provider metadata.

### Service Boundary Notes
- Google OIDC path remains server-validated and issues app session cookies.
- ZeroDev social path is client-side session for login UX and provider modularity.
- Wallet provisioning hook uses `authMetadata.capabilities.smartAccountProvisioning` check.
- WalletConnect adapters are registered but return not-implemented errors when called.
- Unified wallet auth providers (ZeroDev Social, WalletConnect) create wallets client-side; `/auth/me` returns server-provisioned wallet only.
- Privy adapters are registered as client-side unified-wallet providers and reuse the Rhinestone smart-account path.
- In Privy mode, the app explicitly prefers the embedded Privy wallet when choosing the active wagmi wallet, to avoid accidental injected-wallet (chain 1) selection.
- Frontend displays unified wallet status for client-side auth sessions using provider capabilities.

### Implementation Files (Stage 3 - Full Architecture)
**Auth Provider Layer:**
- `web/src/lib/auth/providers/types.ts` - Provider contracts and interfaces
- `web/src/lib/auth/providers/registry.ts` - Registry and AuthFacade
- `web/src/lib/auth/providers/setup.ts` - Auto-registration
- `web/src/lib/auth/providers/adapters/google-oidc.ts` - Google adapter
- `web/src/lib/auth/providers/adapters/zerodev-social.ts` - ZeroDev social adapter
- `web/src/lib/auth/providers/adapters/walletconnect.ts` - WalletConnect placeholder
- `web/src/lib/auth/providers/adapters/privy.ts` - Privy adapter

**Smart Account Provider Layer:**
- `web/src/lib/wallet/providers/types.ts` - Provider contracts and interfaces
- `web/src/lib/wallet/providers/registry.ts` - Registry and SmartAccountFacade
- `web/src/lib/wallet/providers/setup.ts` - Auto-registration
- `web/src/lib/wallet/providers/adapters/zerodev.ts` - ZeroDev adapter
- `web/src/lib/wallet/providers/adapters/walletconnect.ts` - WalletConnect placeholder
- `web/src/lib/wallet/providers/adapters/privy.ts` - Privy smart account adapter

**Updated Route/UI Files:**
- `web/src/app/auth/login/route.ts` - Uses AuthFacade
- `web/src/app/auth/provider/route.ts` - Uses AuthFacade for metadata
- `web/src/app/auth/me/route.ts` - Uses SmartAccountFacade
- `web/src/app/auth/google/callback/route.ts` - Uses facades for provisioning
- `web/src/app/page.tsx` - Capability-driven auth UI

## Stage 4: Reown AppKit Integration (Social Login + Smart Accounts)
Status: Implemented

### Goals
- Add Reown AppKit as a unified auth + wallet provider supporting social login, email OTP, and WalletConnect wallets.
- Leverage AppKit's embedded wallet creation during social login (non-custodial, client-side).
- Integrate via the existing dual-plane adapter architecture without disrupting existing providers.

### Architecture
- AppKit is runtime-gated by `WalletProviderRoot` and only wraps the app when `AUTH_PROVIDER=reown_appkit` (SSR cookie hydration via Wagmi).
- Privy is runtime-gated by `WalletProviderRoot` and only wraps the app when `AUTH_PROVIDER=privy` (`PrivyProvider` + `@privy-io/wagmi` + React Query).
- `<appkit-button>` web component provides the auth modal (social logins, email, wallets).
- Client-side state managed via `useAppKitAccount` and `useAccount` hooks.
- No server-side provisioning needed: AppKit creates embedded wallets as part of the login flow.
- Non-Reown modes use a provider-status fallback screen on `src/app/page.tsx` to avoid Reown/Wagmi runtime crashes when Reown env vars are intentionally unset.
- `zerodev_social` mode now uses `@zerodev/social-validator` (`initiateLogin`, `isAuthorized`, `getSocialValidator`) to derive a client-side Kernel account and display on-chain balances.
- DCA submit/execution remains backed by Rhinestone session-key flow (`/api/dca/execute`), so ZeroDev mode currently provides wallet connectivity/read UX but not ZeroDev-based automated execution.
- Privy mode reuses the same Rhinestone smart-account/session-key flow as Reown mode with provider-scoped strategy records.
- `/api/dca/execute` now uses modular executor routing (`rhinestone` vs `zerodev`) via env `DCA_EXECUTION_PROVIDER`; strategy rows are provider-scoped by `smart_account_provider`.
- ZeroDev DCA activation now builds a permission plugin (`@zerodev/permissions`), captures plugin enable signature, and stores serialized permission-account payload in strategy for backend execution.

### Auth Provider Adapter
| Provider | Server Session | Client Login | Smart Account Provisioning | Unified Wallet Auth |
|----------|----------------|--------------|---------------------------|---------------------|
| `reown_appkit` | No | Yes | No | Yes |

### Smart Account Provider Adapter
| Provider | Server Provisioning | UserOp Submission | External Wallet |
|----------|--------------------|--------------------|-----------------|
| `reown_appkit` | No | Yes (client-side via wagmi) | No |

### Environment Variables
- `NEXT_PUBLIC_REOWN_PROJECT_ID` (Reown/WalletConnect Cloud project ID; required)
- `NEXT_PUBLIC_APPKIT_CHAIN_ID` (optional, defaults to `SMART_ACCOUNT_CHAIN_ID` or `1`)
- `AUTH_PROVIDER=reown_appkit` (to activate)
- `SMART_ACCOUNT_PROVIDER=reown_appkit` (to activate)

### Social Login Features
Configured in `createAppKit()`:
- `email: true` (email OTP login)
- `socials: ["google", "x", "github", "discord", "apple", "facebook", "farcaster"]`
- `emailShowWallets: true` (show wallet options alongside social)
- `allWallets: "SHOW"` (show all WalletConnect wallets)

### Implementation Files
- `web/src/config/index.tsx` - Wagmi adapter + network config
- `web/src/context/index.tsx` - AppKitProvider with createAppKit initialization
- `web/src/global.d.ts` - TypeScript declarations for `<appkit-button>`
- `web/src/lib/auth/providers/adapters/reown-appkit.ts` - Auth adapter
- `web/src/lib/wallet/providers/adapters/reown-appkit.ts` - Smart account adapter
- `web/src/app/layout.tsx` - Root layout with AppKitProvider wrapping
- `web/src/app/page.tsx` - Frontend with AppKit-aware auth UX

## Stage 5: Rhinestone Smart Account + Session Keys (Implemented)
Status: Implemented

### Goals
- Wrap Reown AppKit walletClient into a Rhinestone ERC-7579 smart account (deterministic address across all chains).
- Display cross-chain portfolio via Rhinestone orchestrator.
- Enable session keys for backend DCA automation (user signs once, backend executes autonomously).

### Architecture
- Rhinestone SDK creates a smart account from the Reown AppKit signer (EOA or embedded wallet).
- SDK communicates with the Rhinestone orchestrator via a server-side proxy (`/api/orchestrator/[...path]`).
- The proxy injects `RHINESTONE_API_KEY` as `x-api-key` header so the key never reaches the browser.
- Session keys use Smart Sessions (experimental) with scoped policies.

### Smart Account Model
- Account type: ERC-7579 modular smart account
- Owner: ECDSA signer from Reown AppKit walletClient
- Address: deterministic, same on all supported chains
- Portfolio: unified cross-chain balance view via orchestrator API

### Session Keys for DCA
- Backend signer (`BACKEND_SIGNER_PRIVATE_KEY`) is granted a session key with:
  - `spending-limits` policy: caps total ERC-20 transfer amount per session
  - `time-frame` policy: session expires after configured duration (default 30 days)
- User enables the session with a single on-chain transaction (signs once)
- Backend `/api/dca/execute` endpoint uses the session key to submit DCA transfers

### Environment Variables
- `RHINESTONE_API_KEY` (server-side only, proxied via orchestrator route)
- `BACKEND_SIGNER_PRIVATE_KEY` (existing, reused as session key owner for DCA)

### Implementation Files
- `web/src/app/api/orchestrator/[...path]/route.ts` - Rhinestone API proxy (keeps key server-side)
- `web/src/hooks/useRhinestoneAccount.ts` - Hook: wraps Reown walletClient into Rhinestone smart account
- `web/src/lib/wallet/rhinestone-sessions.ts` - Session key creation + DCA policies
- `web/src/app/api/dca/execute/route.ts` - Backend DCA execution using session key
- `web/src/lib/wallet/providers/adapters/reown-appkit.ts` - Updated adapter reflecting Rhinestone integration
- `web/src/app/page.tsx` - Frontend with Rhinestone smart account + portfolio display
