# Build context is the repo root: docker build -f apps/web/Dockerfile .
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY . .
# Retries cover flaky registry downloads seen on the ARM runner.
RUN for i in 1 2 3; do bun install --frozen-lockfile && break || { [ $i = 3 ] && exit 1; echo "bun install failed, retrying ($i)"; rm -rf node_modules; sleep 5; }; done

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app ./
# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && npx next build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
