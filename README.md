# Perps V2

A full-stack perpetual futures exchange built from scratch — matching engine, real-time orderbook, live PnL, WebSocket data feed, and a modern trading UI inspired by Hyperliquid and dYdX.

Built as a deep learning project to understand every layer of a real exchange: from order matching to margin systems to live market data.

---

## Live Features

### Trading
- Limit and market orders with leverage (1–50×)
- Real-time orderbook via WebSocket (bids/asks with depth bars)
- Live recent trades feed
- TradingView chart with real Binance price data
- Mark price, funding rate, insurance fund stats in the price bar

### Positions & Risk
- Open positions with live unrealized PnL
- One-click close position (settles at mark price)
- Close all positions at once
- Liquidation price estimation per position
- Locked margin tracking

### Order Management
- Open orders tab with live cancel
- Trade history (closed positions with realized PnL)
- Fills tab (matched executions with buy/sell side)

### Account
- JWT authentication (signup / login)
- Available and locked balance in the navbar
- Balance auto-refreshes after every order and close

### Infrastructure
- Backend health indicator (live green dot in navbar)
- WebSocket on-connect snapshot (orderbook loads instantly on refresh)
- Query invalidation after mutations (instant UI updates, no polling lag)

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React, Tailwind CSS 4, TanStack Query v5 |
| State | Zustand (auth + balance) |
| Real-time | WebSocket server (ws library), Redis Streams |
| API | Express.js, JWT auth, Zod validation |
| Matching Engine | Custom price-time priority engine |
| Database | PostgreSQL + Prisma ORM |
| Cache / Pub-Sub | Redis (ioredis), Redis Streams (XREAD / XREVRANGE) |
| Runtime | Bun |
| Monorepo | Turborepo |

---

## Architecture

```
Browser
  │
  ├── HTTP → apps/api (Express, port 3001)
  └── WS  → apps/ws  (WebSocket, port 8080)
                │
                └── Redis Streams
                        │
                        └── apps/engine (Matching Engine)
                                │
                                └── PostgreSQL (via Prisma)
```

**Key design decision — Redis Streams:**  
Orders flow from the API → Redis Stream → Engine. The engine publishes orderbook and trade events back to Redis Streams. The WebSocket server reads those streams and broadcasts to all connected clients. Each blocking `XREAD` listener uses its own dedicated Redis connection to avoid blocking other commands.

---

## Monorepo Structure

```
perps-v2/
├── apps/
│   ├── api/          Express REST API (auth, orders, positions, fills)
│   ├── engine/       Matching engine (price-time priority, partial fills)
│   ├── web/          Next.js 15 frontend (trading UI)
│   └── ws/           WebSocket server (live orderbook + trades)
│
├── packages/
│   ├── db/           Prisma schema + migrations
│   └── redis/        Shared Redis client factory
│
├── docker-compose.yml
├── turbo.json
└── package.json
```

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Docker](https://docker.com) (for PostgreSQL + Redis)

### Setup

```bash
# Clone
git clone https://github.com/prince9118/perps-v2.git
cd perps-v2

# Install dependencies
bun install

# Start PostgreSQL and Redis
docker compose up -d

# Generate Prisma client and run migrations
cd packages/db
bunx prisma generate
bunx prisma migrate dev
cd ../..
```



**`apps/ws/.env`** — none required (Redis defaults to localhost:6379)

**`apps/web/.env.local`** — none required for local dev (API and WS URLs are hardcoded to localhost)

### Run All Services

Open four terminals:

```bash
# Terminal 1 — API
cd apps/api && bun run dev

# Terminal 2 — Matching Engine
cd apps/engine && bun run dev

# Terminal 3 — WebSocket Server
cd apps/ws && bun run dev

# Terminal 4 — Frontend
cd apps/web && bun run dev
```

Visit [http://localhost:3000](http://localhost:3000) → auto-redirects to the BTC-PERP trading page.

---

## What I Learned Building This

- **Matching engine internals** — price-time priority, partial fills, self-trade prevention
- **Redis Streams** — event-driven architecture with `XADD` / `XREAD BLOCK 0` / `XREVRANGE`
- **WebSocket patterns** — on-connect snapshot, dedicated connections per blocking listener, broadcast to all clients
- **Margin systems** — locked balance, unrealized vs realized PnL, liquidation price calculation
- **Next.js 15 App Router** — async params, Server vs Client components, streaming
- **TanStack Query v5** — query invalidation after mutations, refetch intervals, enabled conditions
- **Real-time UI** — orderbook depth bars, spread calculation, live trade feed
- **Monorepo with Turborepo** — shared packages, workspace dependencies, parallel builds

---


