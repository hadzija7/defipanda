# TODO

## Phase 1 - Architecture Baseline
- [x] Create initial architecture map
- [x] Create agent workflow scaffold and rules
- [x] Add local web-to-CRE simulation bridge for end-to-end test flow
- [ ] Confirm system boundaries (web vs CRE vs monitoring)
- [ ] Confirm persistence approach for strategy state

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
