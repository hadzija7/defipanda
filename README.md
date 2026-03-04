# DefiPanda

Automated Dollar-Cost Averaging (DCA) on Ethereum Sepolia, powered by [Chainlink CRE](https://docs.chain.link/cre) workflows, [Rhinestone](https://rhinestone.dev) smart accounts with session keys, and [Privy](https://privy.io) auth.

## What It Does

1. User logs in via Privy, gets a Rhinestone smart account.
2. User activates a DCA strategy and signs a session key (one-time approval).
3. CRE workflow runs on a schedule — reads a Chainlink price feed, then POSTs to the backend.
4. Backend executes a USDC → WETH swap via the session key on the user's behalf.

## Architecture

| Component | Path | Purpose |
|-----------|------|---------|
| **Web** | `web/` | Next.js frontend + API routes (auth, DCA execution, orchestrator proxy) |
| **CRE** | `cre/` | Chainlink CRE workflow that triggers DCA executions |
| **Postgres** | — | Stores users, sessions, DCA positions |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & Docker Compose
- A [Privy](https://privy.io) app ID
- A [Rhinestone](https://rhinestone.dev) API key
- An Ethereum Sepolia RPC URL (e.g. from [Alchemy](https://www.alchemy.com/))
- A funded Sepolia private key (for backend signing + CRE)
- CRE CLI credentials (`cre login` on your host machine)

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url> && cd defipanda

# 2. Copy the env template and fill in your values
cp .env.docker .env

# 3. Start everything
docker compose up --build -d

# 4. Check logs
docker compose logs -f
```

The app will be at **http://localhost:3000** and pgAdmin at **http://localhost:5050**.

To stop:

```bash
docker compose down        # stop containers
docker compose down -v     # stop + delete volumes (resets DB)
```

## Environment Variables

Copy `.env.docker` to `.env` and fill in the required values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Your Privy app ID |
| `NEXT_PUBLIC_PRIVY_RPC_URL` | Yes | Sepolia RPC URL |
| `RHINESTONE_API_KEY` | Yes | Rhinestone dashboard API key |
| `BACKEND_SIGNER_PRIVATE_KEY` | Yes | Backend signer private key |
| `NEXT_PUBLIC_BACKEND_SIGNER_ADDRESS` | Yes | Public address of the above key |
| `CRE_ETH_PRIVATE_KEY` | Yes | Funded Sepolia key for CRE |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `AUTH_SESSION_SECRET` | Yes | Random 64-char string |

See `.env.docker` for the full list including optional variables.

## Local Development (without Docker)

```bash
# Web
cd web
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev                      # http://localhost:3000

# CRE workflow (requires CRE CLI + Bun)
cd cre/dca-workflow
bun install
cre workflow simulate dca-workflow --target=staging-settings
```

You'll need a local Postgres instance. Set `DATABASE_URL` in `web/.env.local` accordingly.

## Project Structure

```
defipanda/
├── web/              # Next.js app (frontend + API)
├── cre/              # CRE automation (Dockerfile + workflows)
│   └── dca-workflow/ # TypeScript DCA workflow
├── docs/             # Architecture docs
├── specs/            # System specs
├── docker-compose.yml
├── .env.docker       # Env template for Docker
└── README.md
```

## License

MIT
