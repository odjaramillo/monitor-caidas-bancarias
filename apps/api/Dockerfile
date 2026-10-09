# Build context: the repository root (docker build -f apps/api/Dockerfile .).
# The lockfile and the workspace file live there.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

# Build stage: install all dependencies, compile TypeScript, then keep only production dependencies.
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api --ignore-scripts
COPY apps/api apps/api
RUN pnpm --filter api build \
 && pnpm --filter api deploy --legacy --prod /out \
 && cp -r apps/api/dist /out/dist

# Runtime stage: no compiler, no dev dependencies, non-root user.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
CMD ["node", "dist/server.js"]
