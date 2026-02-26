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
- [x] Fix one-time init cache poisoning in DB schema/OIDC discovery (retry after transient startup failures)
- [x] Use constant-time HMAC digest verification for signed auth cookies (`timingSafeEqual`) to avoid timing side-channel leaks
