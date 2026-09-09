-- Buyer street address for US sales tax / invoices.

ALTER TABLE developer_subscriptions
  ADD COLUMN IF NOT EXISTS billing_line1 TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT;

COMMENT ON COLUMN developer_subscriptions.billing_line1 IS 'Billing street address line 1';
COMMENT ON COLUMN developer_subscriptions.billing_city IS 'Billing city';

ALTER TABLE developer_invoices
  ADD COLUMN IF NOT EXISTS billing_line1 TEXT,
  ADD COLUMN IF NOT EXISTS billing_city TEXT;

COMMENT ON COLUMN developer_invoices.billing_line1 IS 'Buyer street snapshotted at issue';
COMMENT ON COLUMN developer_invoices.billing_city IS 'Buyer city snapshotted at issue';
