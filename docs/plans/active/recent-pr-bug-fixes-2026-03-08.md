# Recent PR bug-fix plan (2026-03-08)

## Goal
Apply a minimal, high-confidence fix for reproduced regressions introduced in recent PRs.

## Scope
- Docker Compose security posture for CRE->backend auth token handling.
- Keep behavior unchanged except fail-fast validation of missing/unsafe defaults.

## Reproduced bug
1. `docker compose` resolves `CRE_BACKEND_AUTH_TOKEN` to the known fallback value `changeme-local-dev-token` when unset.
2. The same fallback is forwarded to `BACKEND_AUTH_TOKEN_ALL`, enabling accidental insecure deployments.

## Planned fix
1. In `docker-compose.yml`, require `CRE_BACKEND_AUTH_TOKEN` via `:?` interpolation in both places.
2. In `.env.docker`, set `CRE_BACKEND_AUTH_TOKEN=` (empty) with explicit "required" guidance to force deliberate configuration.
3. Update tracking/spec quality docs required by repo conventions.

## Verification plan
1. Reproduce pre-fix fallback via `docker compose config`.
2. After fix, verify missing token fails fast.
3. Verify explicit token value propagates correctly to both env vars.
