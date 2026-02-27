This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Google OAuth (Phase 1)

### Required Environment Variables

Set these in your local environment before testing login:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `AUTH_SESSION_SECRET` (required in production, strongly recommended in development)
- `DATABASE_URL` (required)

Optional:

- `DATABASE_SSL` (`true` when your provider requires SSL)
- `APP_BASE_URL` (defaults to request origin)
- `ALLOW_CRE_SIMULATE` (existing CRE simulation production safety switch)
- `AUTH_PROVIDER` (`google_oidc` default, `zerodev_social`, `walletconnect`, `reown_appkit`)
- `SMART_ACCOUNT_PROVIDER` (`zerodev` default, `walletconnect`, `reown_appkit`)
- `NEXT_PUBLIC_REOWN_PROJECT_ID` (Reown/WalletConnect Cloud project ID; required when `AUTH_PROVIDER=reown_appkit`)
- `NEXT_PUBLIC_APPKIT_CHAIN_ID` (chain ID for Reown AppKit, defaults to `SMART_ACCOUNT_CHAIN_ID` or `1`)
- `NEXT_PUBLIC_ZERODEV_PROJECT_ID` (required when `AUTH_PROVIDER=zerodev_social`)
- `NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER` (`google` default, supports `facebook`)
- `NEXT_PUBLIC_ZERODEV_CHAIN_ID` (chain ID for ZeroDev social, defaults to `SMART_ACCOUNT_CHAIN_ID` or `1`)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (required when `AUTH_PROVIDER=walletconnect`)
- `NEXT_PUBLIC_WALLETCONNECT_CHAIN_ID` (chain ID for WalletConnect, defaults to `SMART_ACCOUNT_CHAIN_ID` or `1`)
- `RHINESTONE_API_KEY` (server-side only; required for Rhinestone smart account + session keys)

### Auth Endpoints

- `GET /auth/login` (provider-aware entrypoint)
- `GET /auth/google/login`
- `GET /auth/google/callback`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/provider`

Implementation notes:

- Protocol: OIDC Authorization Code Flow with PKCE.
- Auth users/sessions are persisted in PostgreSQL.
- Modular dual-plane provider architecture:
  - **Auth providers**: Google OIDC (server session), ZeroDev Social (client-side + unified wallet), WalletConnect (placeholder), Reown AppKit (client-side + unified wallet + social login)
  - **Smart account providers**: ZeroDev (server provisioning), WalletConnect (placeholder), Reown AppKit (client-side embedded wallet)
- Provider selection via `AUTH_PROVIDER` and `SMART_ACCOUNT_PROVIDER` environment variables.
- Routes and UI use `AuthFacade` and `SmartAccountFacade` for provider-agnostic operations.
- WalletConnect adapters are registered but not runtime-enabled (placeholder for future).
- Providers with `unifiedWalletAuth` capability (ZeroDev Social, WalletConnect, Reown AppKit) handle both auth and wallet creation in a single client-side flow.
- Reown AppKit wraps the app in `AppKitProvider` (Wagmi + React Query) with SSR cookie hydration and uses the `<appkit-button>` web component for auth modal.
- Rhinestone SDK wraps the Reown AppKit walletClient into an ERC-7579 smart account with cross-chain portfolio and session key support.
- `/api/orchestrator/[...path]` proxies Rhinestone API requests with server-side API key injection.
- `/api/dca/execute` enables backend DCA execution using Rhinestone session keys (experimental).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
