# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS build

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/common/package.json ./packages/common/package.json
COPY apps/whatsapp-agent/package.json ./apps/whatsapp-agent/package.json

RUN pnpm install --frozen-lockfile --filter whatsapp-agent...

COPY scripts ./scripts
COPY packages/common ./packages/common
COPY apps/backend/swagger-output ./apps/backend/swagger-output
COPY apps/whatsapp-agent ./apps/whatsapp-agent

RUN pnpm --filter @apps/common build
RUN rm -rf apps/whatsapp-agent/src/generated/client
RUN pnpm --filter whatsapp-agent prisma:generate
RUN --mount=type=secret,id=sentry_auth_token \
    sh -lc 'if [ -f /run/secrets/sentry_auth_token ]; then export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; fi; pnpm --filter whatsapp-agent build'

FROM node:20-bookworm-slim AS runtime

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH" \
    NODE_ENV=production

RUN corepack enable \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app /app

WORKDIR /app/apps/whatsapp-agent

EXPOSE 3002

CMD ["node", "dist/main"]
