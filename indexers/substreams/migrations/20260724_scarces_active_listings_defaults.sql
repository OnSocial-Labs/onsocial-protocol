-- Partial catalog updates (purchase/price/bid) can INSERT-on-miss without
-- kind/seller_id when the create event was never materialised. Defaults keep
-- the combined sink from crash-looping on NOT NULL violations.
ALTER TABLE scarces_active_listings
  ALTER COLUMN kind SET DEFAULT 'unknown';
ALTER TABLE scarces_active_listings
  ALTER COLUMN seller_id SET DEFAULT 'unknown';
