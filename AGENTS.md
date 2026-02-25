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

## Commands (to refine)
- Web install: `cd web && pnpm install`
- Web dev: `cd web && pnpm dev`
- CRE workflow run: `cd cre/dca-workflow && npm run start`

## Environment Notes
- `cre/.env` exists and should not be committed publicly.
- Treat `cre/secrets.yaml` as sensitive configuration.
