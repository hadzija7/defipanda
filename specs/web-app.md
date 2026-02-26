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
  - Sanitizes `returnTo` to same-origin relative paths only (blocks protocol-relative/absolute redirects).
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
- Current implementation bootstraps tables at runtime if missing.
- Transient bootstrap/discovery failures are retryable: failed first attempts do not poison long-lived process state.

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
