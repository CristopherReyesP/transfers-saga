# syntax=docker/dockerfile:1

# Multi-stage build: compile with the dev toolchain, then ship only the
# compiled output and the production dependencies.
FROM node:26-slim AS base
WORKDIR /app

# Build stage: dev dependencies are needed for the Nest CLI and TypeScript.
FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Production dependencies only. oracledb runs in thin mode, so no Oracle
# Instant Client is installed.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
# package.json carries "type": "module", which dist/ needs at runtime.
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# The official Node image ships an unprivileged "node" user.
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
