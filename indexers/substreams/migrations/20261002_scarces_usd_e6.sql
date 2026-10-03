-- Dollar sticker beside the NEAR ask. Empty when the listing stays in NEAR.

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS usd_e6 TEXT;

ALTER TABLE scarces_collections_current
  ADD COLUMN IF NOT EXISTS usd_e6 TEXT;
