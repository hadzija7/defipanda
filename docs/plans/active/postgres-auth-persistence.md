# PostgreSQL Auth Persistence Plan

Status: Completed

## Goal
Replace in-memory OAuth/session/user persistence in `web/` with PostgreSQL-backed storage while keeping endpoint behavior unchanged.

## Scope
- Persist OAuth transient flow sessions.
- Persist app sessions.
- Persist Google user records keyed by `sub`.
- Keep cookie signing/session semantics unchanged.

## Implementation Summary
- Added PostgreSQL connection and schema bootstrap in `web/src/lib/db/postgres.ts`.
- Replaced `Map`-based auth store with SQL-backed operations in `web/src/lib/auth/store.ts`.
- Updated auth routes to await async store operations.
- Added `pg` dependency and documented new environment variables.

## Follow-up
- Add explicit migration files instead of runtime schema bootstrap.
- Add integration tests with a temporary PostgreSQL instance.
