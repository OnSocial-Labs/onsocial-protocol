-- Billing region / postal for US sales tax and Canada GST/HST.

ALTER TABLE developer_subscriptions
  ADD COLUMN IF NOT EXISTS billing_region TEXT,
  ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;

COMMENT ON COLUMN developer_subscriptions.billing_region IS 'US state / CA province (2-letter)';
COMMENT ON COLUMN developer_subscriptions.billing_postal_code IS 'US ZIP / CA postal code';

ALTER TABLE developer_invoices
  ADD COLUMN IF NOT EXISTS billing_region TEXT,
  ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;

COMMENT ON COLUMN developer_invoices.billing_region IS 'US state / CA province snapshotted at issue';
COMMENT ON COLUMN developer_invoices.billing_postal_code IS 'Postal / ZIP snapshotted at issue';
