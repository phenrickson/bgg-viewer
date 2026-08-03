# syntax=docker/dockerfile:1

# Multi-stage so the runtime image carries no dev dependencies and no source —
# just prod node_modules and the adapter-node output.
#
# SvelteKit config is inline in vite.config.ts (there is no svelte.config.js);
# adapter-node at defaults emits build/ with build/index.js as the entry.
#
# pnpm is pinned rather than `corepack enable`-d bare: package.json has no
# packageManager field, so corepack would otherwise pick a version at whim and the
# build would drift from local. Keep PNPM_VERSION in step with `pnpm -v`.

FROM node:22-slim AS deps
WORKDIR /app
ENV PNPM_VERSION=11.0.9
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
COPY package.json pnpm-lock.yaml .npmrc ./
# Frozen lockfile: the build must fail on a stale lockfile, not silently re-resolve.
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
WORKDIR /app
ENV PNPM_VERSION=11.0.9
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
COPY package.json pnpm-lock.yaml .npmrc ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV PNPM_VERSION=11.0.9
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
ENV NODE_ENV=production
# PORT is what adapter-node reads; Cloud Run overrides it with 8080.
ENV PORT=3000

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod && pnpm store prune
COPY --from=build /app/build ./build

# Run unprivileged. The node image ships a `node` user; nothing here writes to disk
# (the offline catalog cache is dev-only), so a read-only app dir is fine.
USER node

EXPOSE 3000
CMD ["node", "build/index.js"]
