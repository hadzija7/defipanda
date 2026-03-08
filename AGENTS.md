# DefiPanda Agent Map

## Non-Negotiable Rules
1. Read relevant docs/specs before editing code.
2. Keep changes small, testable, and reversible.
3. After implementation, update `TODO.md`, `docs/quality.md`, and related specs.
4. Write important artifacts to disk (not only in chat).

## Project Snapshot
- Name: DefiPanda
- Purpose: Automated DCA strategy on Chainlink CRE
- Current confirmed systems: web app, CRE workflows, monitoring
- Maturity: early stage (architecture-first, specs evolving)

## Repository Map
- **System specification:** `specs/system-specification.md` (master spec — start here)
- Architecture: `docs/architecture.md`
- Core principles: `docs/core-beliefs.md`
- Quality scorecard: `docs/quality.md`
- Spec index: `specs/README.md`
- Testing strategy: `specs/testing-strategy.md`
- Task plan: `TODO.md`
- Workflows: `.agents/workflows/`
- Cursor rules: `.cursor/rules/`

## How To Work Here
1. Confirm goal and impacted system(s).
2. Read `docs/architecture.md` and related spec stubs.
3. If work spans multiple systems/files, create a plan in `docs/plans/active/`.
4. Implement in small steps with verification.
5. Update docs/spec statuses and quality grades before closing work.

## Commands
- Web install: `cd web && pnpm install`
- Web dev: `cd web && pnpm dev`
- CRE workflow run: `cd cre/dca-workflow && npm run start`
- **Docker (full stack):** `cp .env.docker .env && docker compose up --build`
- **Docker logs:** `docker compose logs -f`
- **Docker teardown:** `docker compose down -v`

## Environment Notes
- `cre/.env` contains real secrets (private keys, tokens) and is gitignored. See `cre/.env.example` for the required variables.
- `cre/secrets.yaml` is a structural mapping (secret name → env var name) with no actual values. It is safe to commit and required by the CRE CLI.
- `.env.docker` is the template for Docker Compose. Copy to `.env` and fill in real values. The `.env` file is gitignored.

## Cursor Cloud specific instructions

### Services overview

| Service | How to run | Notes |
|---------|-----------|-------|
| **Web (Next.js)** | `cd web && pnpm dev` | Runs on port 3000. Needs PostgreSQL + `web/.env.local`. |
| **PostgreSQL** | `sudo docker run -d --name defipanda-postgres -e POSTGRES_DB=defipanda -e POSTGRES_USER=defipanda -e POSTGRES_PASSWORD=devpassword123 -p 5432:5432 postgres:16-alpine` | Schema auto-created on first request by `web/src/lib/db/postgres.ts`. |
| **CRE workflow** | Optional. Requires Bun + CRE CLI + secrets. Not needed for web dev. | See `cre/.env.example`. |

### Startup caveats

- **Docker daemon**: The VM runs inside a Firecracker container. Docker needs `fuse-overlayfs` storage driver and `iptables-legacy`. Start with `sudo dockerd &>/dev/null &`.
- **pnpm build scripts**: pnpm 10 blocks postinstall scripts by default. The `pnpm.onlyBuiltDependencies` field in `web/package.json` lists packages that must be allowed (esbuild, sharp, unrs-resolver, etc.). Without it, `next build` / `next dev` will fail.
- **`web/.env.local`**: Copy from `web/.env.example` and set `DATABASE_URL=postgresql://defipanda:devpassword123@localhost:5432/defipanda`. The schema is auto-migrated on first DB query. Secrets are injected as environment variables — use an unquoted heredoc (`<< ENVEOF`, not `<< 'ENVEOF'`) when writing `.env.local` so `${VAR}` references expand.
- **Privy App ID**: The `/app` route requires a valid `NEXT_PUBLIC_PRIVY_APP_ID`. Without it, the auth screen shows a runtime error. The landing page (`/`) and all API routes work without it.
- **AUTH_PROVIDER must be `privy`**: The `.env.local` must set `AUTH_PROVIDER=privy`. If unset or set to another value, the default is `reown_appkit` which requires `NEXT_PUBLIC_REOWN_PROJECT_ID`.

### Lint / Test / Build

- Lint: `cd web && pnpm lint` — has pre-existing warnings + 1 error in `OnboardingGuide.tsx` (not blocking).
- Test: `cd web && pnpm test` — runs vitest (23 unit tests, all pass without DB or secrets).
- Build: `cd web && pnpm build` — produces standalone Next.js output.
