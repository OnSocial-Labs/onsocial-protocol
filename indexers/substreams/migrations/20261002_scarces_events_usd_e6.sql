-- Dollar sticker on purchase events so sales history shows "$50 · 11.4 NEAR".
-- Empty when the sale was priced in NEAR.

ALTER TABLE scarces_events
  ADD COLUMN IF NOT EXISTS usd_e6 TEXT;
