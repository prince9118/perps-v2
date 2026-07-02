# One image for every Bun backend service (api, ws, engine, workers).
# The service to run is chosen by the compose `command`, e.g. `bun run apps/api/src/index.ts`.
FROM oven/bun:1.3
WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile --production

# Prisma client is generated at build time; DATABASE_URL is only read at runtime.
RUN cd packages/db && DATABASE_URL=postgresql://build:build@localhost/build bunx prisma generate

ENV NODE_ENV=production
CMD ["bun", "run", "apps/api/src/index.ts"]
