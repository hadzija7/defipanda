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
- `SMART_ACCOUNT_OWNER_PRIVATE_KEY` (required when enabled, server-managed signer key)
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
