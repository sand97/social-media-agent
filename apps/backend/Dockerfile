FROM node:20-bookworm-slim AS build

ENV PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN}"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/common/package.json ./packages/common/package.json
COPY apps/backend/package.json ./apps/backend/package.json

RUN pnpm install --frozen-lockfile --filter backend...

COPY scripts ./scripts
COPY packages/common ./packages/common
COPY apps/backend ./apps/backend

RUN pnpm --filter @apps/common build
RUN rm -rf apps/backend/src/generated/client
RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

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

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/main"]
