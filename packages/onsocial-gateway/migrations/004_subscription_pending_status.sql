-- Add 'pending' to the allowed subscription statuses.
-- Subscriptions start as 'pending' after checkout redirect, before
-- the Revolut webhook confirms payment.

ALTER TABLE developer_subscriptions
  DROP CONSTRAINT IF EXISTS developer_subscriptions_status_check;

ALTER TABLE developer_subscriptions
  ADD CONSTRAINT developer_subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'past_due', 'pending', 'expired'));

COMMENT ON COLUMN developer_subscriptions.status IS 'pending, active, cancelled, past_due, or expired';
