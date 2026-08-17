# syntax=docker/dockerfile:1.7
# Builds the production storefront image and its dependency, build, and runtime stages.

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM dependencies AS migrations
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS square-sync-dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=dependencies /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS square-sync
ARG STOREFRONT_RELEASE_ID
RUN test -n "${STOREFRONT_RELEASE_ID}" \
  && test "${STOREFRONT_RELEASE_ID}" != "CHANGE_ME_IMMUTABLE_RELEASE"
LABEL com.modernstate.storefront.square-sync.contract="1" \
  com.modernstate.storefront.square-sync.release="${STOREFRONT_RELEASE_ID}"
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV SQUARE_SYNC_EXTERNAL_ENV_ONLY=true

COPY --from=square-sync-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node scripts/register-typescript-alias.mjs scripts/sync-square-postgres-read-only.ts ./scripts/
COPY --chown=node:node src ./src

USER node
ENTRYPOINT ["node", "--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--conditions=react-server", "--experimental-transform-types", "--import", "./scripts/register-typescript-alias.mjs", "./scripts/sync-square-postgres-read-only.ts"]
CMD ["--sync"]

FROM dependencies AS builder
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_INDEXABLE=false
ARG NEXT_PUBLIC_SQUARE_APPLICATION_ID
ARG NEXT_PUBLIC_SQUARE_LOCATION_ID
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_SITE_INDEXABLE=${NEXT_PUBLIC_SITE_INDEXABLE}
ENV NEXT_PUBLIC_SQUARE_APPLICATION_ID=${NEXT_PUBLIC_SQUARE_APPLICATION_ID}
ENV NEXT_PUBLIC_SQUARE_LOCATION_ID=${NEXT_PUBLIC_SQUARE_LOCATION_ID}
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
