# ---------- base ----------
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# ---------- build ----------
FROM base AS build

# NEXT_PUBLIC_* vars must be present at build time (inlined by Next.js)
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_PRIVY_CHAIN_ID=11155111
ARG NEXT_PUBLIC_PRIVY_RPC_URL
ARG NEXT_PUBLIC_ZERODEV_PROJECT_ID
ARG NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER=google
ARG NEXT_PUBLIC_ZERODEV_RPC_URL
ARG NEXT_PUBLIC_REOWN_PROJECT_ID
ARG NEXT_PUBLIC_BACKEND_SIGNER_ADDRESS

ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_PRIVY_CHAIN_ID=$NEXT_PUBLIC_PRIVY_CHAIN_ID
ENV NEXT_PUBLIC_PRIVY_RPC_URL=$NEXT_PUBLIC_PRIVY_RPC_URL
ENV NEXT_PUBLIC_ZERODEV_PROJECT_ID=$NEXT_PUBLIC_ZERODEV_PROJECT_ID
ENV NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER=$NEXT_PUBLIC_ZERODEV_SOCIAL_PROVIDER
ENV NEXT_PUBLIC_ZERODEV_RPC_URL=$NEXT_PUBLIC_ZERODEV_RPC_URL
ENV NEXT_PUBLIC_REOWN_PROJECT_ID=$NEXT_PUBLIC_REOWN_PROJECT_ID
ENV NEXT_PUBLIC_BACKEND_SIGNER_ADDRESS=$NEXT_PUBLIC_BACKEND_SIGNER_ADDRESS

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- runner ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
