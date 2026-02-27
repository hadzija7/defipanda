# ZeroDev Support Ticket — Social Login "Project not found"

**Date:** 2026-02-27  
**Priority:** High (blocks social login integration)  
**Product:** ZeroDev Social Validator SDK  

---

## Summary

We are integrating ZeroDev social login (Google) with smart accounts on **Base Sepolia** using `@zerodev/social-validator`. When calling `sdk.initiateLogin()`, the flow fails immediately with:

```
Failed to fetch Magic key: 400
```

The underlying API call returns:

```
HTTP 400  {"error":"Project not found"}
```

## Environment

| Item | Value |
|---|---|
| Project ID | `41f8381b-6fe1-4cf2-a6db-fb3eb9b42718` |
| Chain | Base Sepolia (chain ID `84532`) |
| `@zerodev/social-validator` | `^5.2.3` |
| `@zerodev/sdk` | `^5.5.7` |
| `@zerodev/ecdsa-validator` | `^5.4.9` |
| Framework | Next.js 16.1.6 / React 19.2.3 |
| Node runtime | Client-side (browser), dynamic import |
| Callback URL | `http://localhost:3000/` |
| Social provider | `google` |

## Steps to Reproduce

1. Configure `NEXT_PUBLIC_ZERODEV_PROJECT_ID=41f8381b-6fe1-4cf2-a6db-fb3eb9b42718` in a Next.js app.

2. Call the social validator SDK from the browser:

```typescript
import * as sdk from "@zerodev/social-validator";

await sdk.initiateLogin({
  socialProvider: "google",
  oauthCallbackUrl: "http://localhost:3000/",
  projectId: "41f8381b-6fe1-4cf2-a6db-fb3eb9b42718",
});
```

3. The SDK internally hits the key lookup endpoint and fails before any OAuth redirect happens.

## Observed Behavior

- The SDK makes a request to `https://backend-vikp.onrender.com/v1/social/key?projectId=41f8381b-6fe1-4cf2-a6db-fb3eb9b42718`.
- That endpoint returns **HTTP 400** with body `{"error":"Project not found"}`.
- The SDK throws: `Failed to fetch Magic key: 400`.
- No OAuth popup or redirect is triggered; the flow fails immediately.

## Expected Behavior

- The key endpoint should resolve the project and return the Magic key.
- The SDK should proceed to initiate the Google OAuth redirect/popup.

## What We've Verified

1. **Project ID is valid for RPC.** The same project ID works for ZeroDev RPC calls at `https://rpc.zerodev.app/api/v3/41f8381b-6fe1-4cf2-a6db-fb3eb9b42718/chain/84532` — smart account operations via `@zerodev/sdk` succeed.

2. **Direct endpoint probe confirms the error:**
   ```bash
   curl "https://backend-vikp.onrender.com/v1/social/key?projectId=41f8381b-6fe1-4cf2-a6db-fb3eb9b42718"
   # → 400 {"error":"Project not found"}
   ```

3. **Callback URL is deterministic.** We use `${window.location.origin}/` → `http://localhost:3000/` to avoid query-param mismatches.

4. **SDK versions are current** (installed via pnpm from npm registry).

## Questions for ZeroDev Team

1. Does the project `41f8381b-6fe1-4cf2-a6db-fb3eb9b42718` have **social login enabled** in the ZeroDev dashboard? Is there a separate toggle for social auth vs. standard smart account usage?

2. Is Google specifically enabled as a social provider for this project? Is there an additional step required beyond creating the project?

3. Does `http://localhost:3000` need to be whitelisted in the project's allowed domains/redirect URIs for the social key endpoint to resolve?

4. Is the social key backend (`backend-vikp.onrender.com`) the correct/current endpoint, or has it been migrated? We noticed the SDK resolves this internally.

5. Are there any known issues with `@zerodev/social-validator@5.2.x` and recent backend changes?

## Impact

This blocks our social login → smart account onboarding flow for the DefiPanda DCA product (hackathon project using Chainlink CRE). We have a working fallback via Reown AppKit, but we'd prefer the unified ZeroDev social login experience for non-crypto-native users.

## Contact

Happy to provide dashboard screenshots, browser network traces, or a minimal reproduction repo if that helps diagnose the issue.
