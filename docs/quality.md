# Quality Scorecard

Last Updated: 2026-03-03

## Domain Status
| Domain | Spec | Code | Tests | Review | Overall |
|---|---|---|---|---|---|
| Web App | C | C | F | F | C |
| CRE Workflows | C | C | F | F | C |
| DCA Execution | C | B- | F | F | C+ |
| Monitoring | F | F | F | F | F |

## Cross-Cutting Layers
| Layer | Grade | Notes |
|---|---|---|
| Security | B- | Google OIDC code+PKCE flow with signed session cookies; HMAC verification now uses constant-time comparison; users/sessions are persisted in PostgreSQL; `returnTo` open-redirect hardening includes tab/newline/carriage-return control-char filtering; modular provider architecture with typed adapter contracts; unified wallet auth capability for ZeroDev Social, WalletConnect, Reown AppKit, and Privy (client-side wallet management); AppKit and Privy create non-custodial embedded wallets with social login; Rhinestone API key proxied server-side via `/api/orchestrator` (never exposed to browser); session keys use spending-limit policies for scoped DCA automation; `/api/dca/execute` now requires bearer token authentication; CRE→backend requests use constant-time token comparison; Smart Sessions: user signs `experimental_signEnableSession` once, enable signature stored in DB, backend passes `enableData` for every execution (Rhinestone "enable mode") |
| Observability | F | Monitoring architecture not finalized; auth UI now emits provider-specific ZeroDev login error details to browser console for faster triage |
| Performance | F | No baseline measurements yet |
| CI/CD | D | Docker Compose self-hosting scaffolded; no CI pipeline yet |
| Documentation | C | Initial scaffold established |

## Known Gaps
- DCA positions now stored in PostgreSQL (`dca_positions` table) with interval-based scheduling.
- No explicit monitoring stack or alert routing.
- Automated tests are still minimal (currently focused on auth redirect sanitization and transient init retry behavior).
- Auth schema is currently initialized at runtime; dedicated migration workflow is still pending.
- ZeroDev social login remains sensitive to external project/domain configuration; runtime diagnostics are now in place but server-side observability is still minimal.
- Rhinestone Smart Sessions is experimental; session key API may have breaking changes.
- CRE workflow simulation not yet verified end-to-end (pending `cre workflow simulate` run).
- In-memory idempotency guard removed; DB interval check in `getDuePositions()` is the sole dedup mechanism.
- Uniswap V3 USDC/WETH pool liquidity on Ethereum Sepolia not yet verified; `amountOutMinimum=0` on testnet as workaround.
- DCA positions are now DB-backed; schema auto-initializes at first query.
- Production needs a job queue for sequential nonce management across concurrent user executions.
- CRE `cacheSettings.maxAge` reduced to 10s (from 60s) to avoid stale cache blocking consecutive cron triggers.
- Execute endpoint now pre-checks USDC balance and skips positions gracefully.
- Frontend now reads USDC/WETH balances directly from chain (independent of Rhinestone portfolio API) and warns when balance < DCA amount.
- "Bundle simulation failed" root cause: session key was never authorized by the account owner. Fixed by adding Smart Sessions enable flow (user signs once on DCA activation, enable signature persisted in DB).
- Session definition is now deterministic (no `Date.now()`): spending-limit policy only, same hash on frontend and backend.
- Frontend now exposes `sessionGranted` status; shows explicit "Grant Session" button when position is active but session key not signed.
- Execute endpoint no longer calls `markExecuted()` for session-not-granted positions — they retry on every CRE trigger until the user grants the session.
- DCA execution is now modular (`rhinestone` vs `zerodev`) but provider-specific test coverage is missing.
- ZeroDev social automation now uses permissions/session-key serialization, but end-to-end reliability tests are still missing across redeploy/migration scenarios.
- **DCA execution verified on-chain** (2026-03-03): USDC→WETH swap via Rhinestone orchestrator intent system with session key authorization. Key findings:
  - `sponsored: true` is mandatory for session-key intents (non-sponsored routing goes through Permit2/Paymaster, violating session permissions)
  - SDK `waitForExecution` returns prematurely at PRECONFIRMED status; custom `waitForIntentFill` polls until COMPLETED/FILLED
  - Frontend deploy+session-enable is atomic via `sendTransaction` with `experimental_enableSession()`
