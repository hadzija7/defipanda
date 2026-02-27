# ZeroDev Social Login Incident - 2026-02-27

Status: Open  
Owner: Web/Auth

## Symptom
- User login flow in social mode fails with `Auth error: zerodev_social_login_failed`.

## Evidence
- `AUTH_PROVIDER=zerodev_social` is enabled in local environment.
- `@zerodev/social-validator` login path fails before backend app session creation.
- Direct probe of the SDK key lookup endpoint for the configured project ID returned:
  - `400 {"error":"Project not found"}`

## Likely Root Causes
1. `NEXT_PUBLIC_ZERODEV_PROJECT_ID` does not match an active ZeroDev social-enabled project.
2. ZeroDev dashboard social provider setup is incomplete (Google not enabled).
3. Redirect/domain whitelist does not include local callback target.
4. Callback URL variability (`window.location.href` including query params) can trigger strict redirect validation mismatches.

## Mitigations Implemented
- Frontend login callback URL changed to deterministic `${window.location.origin}/`.
- Frontend now logs caught ZeroDev login error details (`message`, provider, projectId context) and surfaces error code with message suffix in UI.

## Operator Verification Checklist
- Confirm project exists and is active in ZeroDev dashboard.
- Confirm social login is enabled for that project.
- Confirm Google provider is enabled for social auth.
- Whitelist `http://localhost:3000` (and callback path used).
- Verify key endpoint resolves for project ID:
  - `curl "https://backend-vikp.onrender.com/v1/social/key?projectId=<PROJECT_ID>"`
- Restart `pnpm dev` after `.env.local` updates.
- Retry login and inspect browser console for `ZeroDev social login failed:` payload if failure persists.

## Exit Criteria
- Login redirects to provider and returns to app without `authError`.
- `isAuthorized({ projectId })` returns `true` after redirect.
- No `ZeroDev social login failed` logs on a clean login attempt.
