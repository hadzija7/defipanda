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
- Contracts build: `cd contracts && forge build`
- Contracts test: `cd contracts && forge test`
- **Docker (full stack):** `cp .env.docker .env && docker compose up --build`
- **Docker logs:** `docker compose logs -f`
- **Docker teardown:** `docker compose down -v`

## Environment Notes
- `cre/.env` contains real secrets (private keys, tokens) and is gitignored. See `cre/.env.example` for the required variables.
- `cre/secrets.yaml` is a structural mapping (secret name → env var name) with no actual values. It is safe to commit and required by the CRE CLI.
- `.env.docker` is the template for Docker Compose. Copy to `.env` and fill in real values. The `.env` file is gitignored.
