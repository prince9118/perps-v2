ALTER TABLE "Fill" ADD COLUMN     "takerSide" TEXT,
ADD COLUMN     "tradeId" TEXT;

ALTER TABLE "FundingRate" ADD COLUMN     "period" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "engineSeq" TEXT,
ADD COLUMN     "lockedMargin" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reduceOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'user';

CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fill_tradeId_key" ON "Fill"("tradeId");

CREATE INDEX "Fill_buyerId_createdAt_idx" ON "Fill"("buyerId", "createdAt");

CREATE INDEX "Fill_sellerId_createdAt_idx" ON "Fill"("sellerId", "createdAt");

CREATE INDEX "FundingPayment_userId_createdAt_idx" ON "FundingPayment"("userId", "createdAt");

CREATE INDEX "FundingRate_createdAt_idx" ON "FundingRate"("createdAt");

CREATE UNIQUE INDEX "FundingRate_market_period_key" ON "FundingRate"("market", "period");

CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

CREATE INDEX "Order_status_market_idx" ON "Order"("status", "market");

CREATE INDEX "Position_userId_status_idx" ON "Position"("userId", "status");

CREATE INDEX "Position_status_market_idx" ON "Position"("status", "market");

CREATE INDEX "PositionHistory_userId_createdAt_idx" ON "PositionHistory"("userId", "createdAt");


UPDATE "Order" SET "originalQuantity" = "quantity" WHERE "originalQuantity" <= 0;

UPDATE "Order"
SET "status" = 'cancelled', "reason" = 'migrated', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" NOT IN ('filled', 'cancelled', 'rejected');

DELETE FROM "FundingRate" WHERE "market" NOT IN ('BTC-PERP', 'ETH-PERP', 'SOL-PERP');

DO $$
DECLARE
  g RECORD;
  lq DOUBLE PRECISION;
  ln DOUBLE PRECISION;
  lm DOUBLE PRECISION;
  llev DOUBLE PRECISION;
  sq DOUBLE PRECISION;
  sn DOUBLE PRECISION;
  sm DOUBLE PRECISION;
  slev DOUBLE PRECISION;
  matched DOUBLE PRECISION;
  realized DOUBLE PRECISION;
  net_side TEXT;
  net_qty DOUBLE PRECISION;
  net_entry DOUBLE PRECISION;
  net_margin DOUBLE PRECISION;
  net_lev DOUBLE PRECISION;
BEGIN
  FOR g IN
    SELECT "userId", "market" FROM "Position"
    WHERE "status" = 'open'
    GROUP BY "userId", "market"
    HAVING COUNT(*) > 1
  LOOP
    SELECT COALESCE(SUM("quantity"), 0), COALESCE(SUM("quantity" * "entryPrice"), 0), COALESCE(SUM("margin"), 0), COALESCE(MAX("leverage"), 1)
      INTO lq, ln, lm, llev
      FROM "Position"
      WHERE "status" = 'open' AND "userId" = g."userId" AND "market" = g."market" AND "side" = 'long';
    SELECT COALESCE(SUM("quantity"), 0), COALESCE(SUM("quantity" * "entryPrice"), 0), COALESCE(SUM("margin"), 0), COALESCE(MAX("leverage"), 1)
      INTO sq, sn, sm, slev
      FROM "Position"
      WHERE "status" = 'open' AND "userId" = g."userId" AND "market" = g."market" AND "side" = 'short';

    matched := LEAST(lq, sq);
    realized := 0;
    IF matched > 0 THEN
      realized := ROUND((matched * (sn / sq - ln / lq))::numeric, 6)::double precision;
    END IF;

    IF lq >= sq THEN
      net_side := 'long';
      net_qty := lq - sq;
      net_entry := CASE WHEN lq > 0 THEN ln / lq ELSE 0 END;
      net_margin := CASE WHEN lq > 0 THEN lm * net_qty / lq ELSE 0 END;
      net_lev := llev;
    ELSE
      net_side := 'short';
      net_qty := sq - lq;
      net_entry := sn / sq;
      net_margin := sm * net_qty / sq;
      net_lev := slev;
    END IF;

    UPDATE "Position"
    SET "status" = 'closed', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "status" = 'open' AND "userId" = g."userId" AND "market" = g."market";

    IF matched > 0 THEN
      INSERT INTO "PositionHistory" ("id", "userId", "market", "side", "quantity", "entryPrice", "exitPrice", "leverage", "margin", "pnl", "reason")
      VALUES (
        gen_random_uuid()::text, g."userId", g."market",
        CASE WHEN net_side = 'long' THEN 'short' ELSE 'long' END,
        matched,
        CASE WHEN net_side = 'long' THEN sn / sq ELSE ln / lq END,
        CASE WHEN net_side = 'long' THEN ln / lq ELSE sn / sq END,
        CASE WHEN net_side = 'long' THEN slev ELSE llev END,
        ROUND(((lm + sm) - net_margin)::numeric, 6)::double precision,
        realized,
        'netted'
      );
      UPDATE "User" SET "balance" = "balance" + realized WHERE "id" = g."userId";
    END IF;

    IF net_qty > 0 THEN
      INSERT INTO "Position" ("id", "userId", "market", "side", "status", "quantity", "entryPrice", "leverage", "margin", "pnl", "riskScore", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, g."userId", g."market", net_side, 'open', net_qty, net_entry, net_lev, ROUND(net_margin::numeric, 6)::double precision, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;

UPDATE "Position" SET "margin" = ROUND("margin"::numeric, 6)::double precision WHERE "status" = 'open';

UPDATE "User" u
SET
  "lockedBalance" = ROUND(COALESCE(p.m, 0)::numeric, 6)::double precision,
  "balance" = GREATEST(ROUND((u."balance" + u."lockedBalance" - COALESCE(p.m, 0))::numeric, 6), 0)::double precision
FROM (
  SELECT x."id", (SELECT SUM(y."margin") FROM "Position" y WHERE y."userId" = x."id" AND y."status" = 'open') AS m
  FROM "User" x
) p
WHERE p."id" = u."id";

UPDATE "User" u
SET "email" = LOWER(TRIM(u."email"))
WHERE u."email" <> LOWER(TRIM(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "User" o WHERE o."id" <> u."id" AND LOWER(TRIM(o."email")) = LOWER(TRIM(u."email"))
  );

UPDATE "FeeAccount" SET "balance" = ROUND("balance"::numeric, 6)::double precision;
UPDATE "InsuranceFund" SET "balance" = ROUND("balance"::numeric, 6)::double precision;

CREATE UNIQUE INDEX "Position_userId_market_open_key" ON "Position"("userId", "market") WHERE "status" = 'open';
