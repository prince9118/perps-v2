# One image for every Bun backend service (api, ws, engine, workers).
# The service to run is chosen by the compose `command`, e.g. `bun run apps/api/src/index.ts`.
FROM oven/bun:1.3
WORKDIR /app

COPY . .
# Retries cover flaky registry downloads seen on the ARM runner.
RUN for i in 1 2 3; do bun install --frozen-lockfile --production && break || { [ $i = 3 ] && exit 1; echo "bun install failed, retrying ($i)"; rm -rf node_modules; sleep 5; }; done

# Prisma client is generated at build time; DATABASE_URL is only read at runtime.
RUN cd packages/db && DATABASE_URL=postgresql://build:build@localhost/build bunx prisma generate

ENV NODE_ENV=production
CMD ["bun", "run", "apps/api/src/index.ts"]
