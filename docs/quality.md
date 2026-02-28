# Quality Scorecard

Last Updated: 2026-02-28

## Domain Status
| Domain | Spec | Code | Tests | Review | Overall |
|---|---|---|---|---|---|
| Web App | C | C | F | F | C |
| CRE Workflows | C | C | F | F | C |
| DCA Execution | C | C | F | F | C |
| Monitoring | F | F | F | F | F |

## Cross-Cutting Layers
| Layer | Grade | Notes |
|---|---|---|
| Security | C+ | Google OIDC code+PKCE flow with signed session cookies; HMAC verification now uses constant-time comparison; users/sessions are persisted in PostgreSQL; `returnTo` open-redirect hardening includes tab/newline/carriage-return control-char filtering; modular provider architecture with typed adapter contracts; unified wallet auth capability for ZeroDev Social, WalletConnect, and Reown AppKit (client-side wallet management); AppKit creates non-custodial embedded wallets with social login; Rhinestone API key proxied server-side via `/api/orchestrator` (never exposed to browser); session keys use spending-limit + time-frame policies for scoped DCA automation; `/api/dca/execute` now requires bearer token authentication; CRE→backend requests use constant-time token comparison |
| Observability | F | Monitoring architecture not finalized; auth UI now emits provider-specific ZeroDev login error details to browser console for faster triage |
| Performance | F | No baseline measurements yet |
| CI/CD | F | Pipeline not documented yet |
| Documentation | C | Initial scaffold established |

## Known Gaps
- DCA positions now stored in PostgreSQL (`dca_positions` table) with interval-based scheduling.
- No explicit monitoring stack or alert routing.
- Automated tests are still minimal (currently focused on auth redirect sanitization and transient init retry behavior).
- Auth schema is currently initialized at runtime; dedicated migration workflow is still pending.
- ZeroDev social login remains sensitive to external project/domain configuration; runtime diagnostics are now in place but server-side observability is still minimal.
- Rhinestone Smart Sessions is experimental; session key API may have breaking changes.
- CRE workflow simulation not yet verified end-to-end (pending `cre workflow simulate` run).
- Idempotency store is in-memory (lost on restart) — needs Redis or DB backing for production.
- Uniswap V3 USDC/WETH pool liquidity on Base Sepolia not yet verified.
- DCA positions are now DB-backed; schema auto-initializes at first query.
- Production needs a job queue for sequential nonce management across concurrent user executions.
