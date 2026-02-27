# DefiPanda Architecture (Simple v0)

## Goal
DefiPanda executes an automated DCA strategy using Chainlink CRE, with a web app for control/visibility and monitoring for reliability.

## Confirmed Systems
1. **Web App (`web/`)**
   - Next.js user interface.
   - Primary responsibilities: strategy setup, status display, operator controls, and user authentication session handling.
2. **CRE Workflows (`cre/`)**
   - Workflow and config files for DCA execution.
   - Primary responsibilities: schedule/trigger logic, execution orchestration, environment-specific config.
3. **Monitoring (TBD implementation)**
   - Observability for workflow health and failures.
   - Primary responsibilities: heartbeat checks, error surfacing, execution history signals.

## High-Level Data Flow
1. User configures or updates strategy in the web app.
2. Web layer writes/reads strategy state (exact persistence model TBD).
3. CRE workflow executes DCA actions according to configured rules.
4. Monitoring captures execution outcomes and alerts on failure conditions.
5. Web app surfaces status and recent execution outcomes.

## Current Directory Map
- `web/`: Next.js app and server-side API bridge for local CRE simulation.
- `cre/`: CRE project files and `dca-workflow/` implementation.
- `docs/`: project docs and architecture decisions.
- `specs/`: evolving system specs and testing strategy.

## Current Local Test Bridge
- Endpoint: `POST /api/cre/simulate` in `web/`.
- Execution path: frontend button -> Next.js server route -> `cre workflow simulate`.
- Working directory for CLI execution: `../cre` (from the `web/` app).
- Safety: route is blocked in production unless `ALLOW_CRE_SIMULATE=true`.

## Current Auth Bridge (Phase 1)
- Endpoints:
  - `GET /auth/google/login`
  - `GET /auth/google/callback`
  - `POST /auth/logout`
  - `GET /auth/me`
- Protocol: Google OIDC Authorization Code Flow with PKCE, server-side token exchange.
- Identity key: Google `sub` claim.
- Persistence: PostgreSQL-backed user/session/auth-flow tables.

## Planned Auth + Wallet Bridge (Phase 2)
- After successful Google callback, backend triggers smart-account provisioning (`create-or-load`) keyed by `user_sub`.
- One smart account per user per configured chain/provider tuple.
- Login remains resilient: session issuance is not blocked by provisioning failures.
- Backend owns UserOp preparation/submission through a Viem + ZeroDev integration module.
- Browser surfaces wallet provisioning status; it does not submit UserOps directly.

## Tech Stack (Current)
- Frontend: Next.js
- Automation runtime: Chainlink CRE
- Monitoring: TBD (tooling not chosen yet)

## Key Unknowns To Resolve Next
1. Source of truth for strategy state (where and how it is stored).
2. Boundaries between web and CRE config ownership.
3. Monitoring stack selection and alert channels.
4. Deployment model (environments, secrets handling, promotion flow).

## Initial Conventions
- Keep all workflow secrets out of source control.
- Prefer explicit environment-specific config files.
- Treat docs/specs as living artifacts and update them with implementation changes.
