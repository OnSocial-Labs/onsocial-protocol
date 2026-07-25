-- Server-side price sorting for the Market catalog.
-- `price` stays TEXT (u128 yocto); `price_numeric` is a stored generated
-- column so the sink never writes it and it can never drift from `price`.
ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS price_numeric NUMERIC GENERATED ALWAYS AS (
    CASE WHEN price ~ '^[0-9]+$' THEN price::numeric ELSE NULL END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_price
  ON scarces_active_listings(price_numeric);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_expires
  ON scarces_active_listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_kind_listed
  ON scarces_active_listings(kind, listed_block_timestamp DESC);
