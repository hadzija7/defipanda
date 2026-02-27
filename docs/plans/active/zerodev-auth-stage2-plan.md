# ZeroDev Smart Account Stage 2 Plan

Status: Proposed

## Goal
Provision one deterministic ZeroDev smart account per authenticated Google user, then use backend-owned orchestration to submit UserOperations safely.

## Scope
- Extend auth flow after successful OIDC callback.
- Add wallet provisioning service (create-or-load).
- Persist user-to-smart-account linkage and provisioning status.
- Define backend UserOp submission path (no full strategy execution yet).

## Non-Goals (This Stage)
- Session keys, delegated AI agent signing, and policy plugin hardening.
- Multi-chain abstractions beyond one initial chain.
- Production-grade key custody/HSM rollout (define interface now, harden later).

## Modular Design
1. **Auth Integration Module**
   - Location: `web/src/lib/auth/` + callback route hook.
   - Responsibility: after `sub` is verified and user is upserted, trigger account provisioning in a non-blocking-safe way.
   - Contract:
     - Input: `userSub`, optional profile hints.
     - Output: provisioning result (`ready | pending | failed`) and account metadata when available.

2. **Wallet Provisioning Module**
   - Location: `web/src/lib/wallet/`.
   - Responsibility: idempotent create-or-load account.
   - Contract:
     - `ensureSmartAccountForUser(userSub): Promise<ProvisioningResult>`
   - Behavior:
     - If active mapping exists, return it.
     - If not, create deterministic account via ZeroDev SDK + Viem stack.
     - Persist success or failure details atomically.

3. **Wallet Persistence Module**
   - Location: `web/src/lib/db/` and `web/src/lib/auth/store.ts` (or split store).
   - Responsibility: account linkage + lifecycle state.
   - Core fields:
     - `user_sub`
     - `chain_id`
     - `smart_account_address`
     - `provider` (initially `zerodev`)
     - `provisioning_status` (`pending | ready | failed`)
     - `last_error`, `updated_at`

4. **UserOp Orchestration Module**
   - Location: `web/src/lib/wallet/userops.ts` + API route later.
   - Responsibility: backend prepares and submits UserOps through bundler.
   - Initial API shape:
     - `buildUserOp(...)`
     - `submitUserOp(...)`
     - `waitForUserOpReceipt(...)`
   - Keep provider-specific parts behind adapter boundaries.

## Auth Flow Connection
1. User completes Google login (`/auth/google/callback`).
2. Existing Phase 1 session issuance remains first-class and resilient.
3. Stage 2 hook calls `ensureSmartAccountForUser(userSub)`.
4. If provisioning succeeds:
   - store mapping and mark `ready`.
5. If provisioning fails:
   - keep auth session valid;
   - mark `failed`, persist `last_error`, expose in `/auth/me` as wallet status for UI messaging/retry.

## Backend UserOp Tech Stack (Simple Baseline)
- **Viem** for chain client, signing primitives, and RPC interaction.
- **ZeroDev SDK (Core/Kernel path)** for smart account creation and UserOp helpers.
- **Bundler RPC** via ZeroDev endpoint (single chain to start).
- **Paymaster** optional at first; allow direct gas mode until sponsorship is needed.

Why this baseline:
- Matches current TypeScript stack and your requested Viem-first direction.
- Keeps abstractions small while staying compatible with future policy/session key expansion.

## Idempotency and Failure Model
- Use `user_sub + chain_id + provider` uniqueness in DB.
- Provisioning algorithm:
  1. insert/update row to `pending`,
  2. attempt create/load,
  3. write `ready` + address on success, else `failed` + error.
- Retries:
  - safe to re-run on next login or explicit retry endpoint.
  - never create duplicate linkage rows for same user/chain/provider tuple.

## Security Baseline
- Keep signer material server-side only; never expose private key to browser.
- Scope environment variables per runtime (`web` server only).
- Add structured logs for provisioning attempts and UserOp submissions.
- Add redaction rules for secrets and sensitive RPC payloads in logs.

## Rollout
1. Feature flag `ENABLE_SMART_ACCOUNT_PROVISIONING` (off by default).
2. Enable for internal/canary users by allowlist on `user_sub` or email domain.
3. Observe:
   - provisioning success rate
   - callback latency impact
   - UserOp failure rate
4. Rollback: disable flag, keep existing sessions/auth unaffected.

## Implementation Order
1. Spec and schema definition.
2. Wallet persistence methods + tests.
3. Provisioning service + tests (idempotency/failure).
4. Auth callback hook wiring + integration test.
5. UserOp submission module scaffold + smoke test.
6. Ops docs and runbook.
