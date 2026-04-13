-- Developer subscription tracking for tiered API access.
-- Run against the same PostgreSQL database Hasura uses.
--
-- After applying, track in Hasura:
--   hasura metadata apply
-- or via console: Data → Track "developer_subscriptions" table

CREATE TABLE IF NOT EXISTS developer_subscriptions (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                    TEXT        NOT NULL UNIQUE,
  tier                          TEXT        NOT NULL CHECK (tier IN ('pro', 'scale')),
  status                        TEXT        NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'expired')),
  revolut_subscription_id       TEXT,
  revolut_customer_id           TEXT,
  revolut_setup_order_id        TEXT,
  revolut_last_order_id         TEXT,
  promotion_code                TEXT,
  promotion_cycles_remaining    INT         NOT NULL DEFAULT 0,
  current_period_start          TIMESTAMPTZ NOT NULL,
  current_period_end            TIMESTAMPTZ NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by revolut setup order (webhook resolution strategy 2)
CREATE INDEX IF NOT EXISTS idx_dev_subs_setup_order
  ON developer_subscriptions (revolut_setup_order_id)
  WHERE revolut_setup_order_id IS NOT NULL;

-- Fast lookup by revolut subscription id (webhook cycle matching)
CREATE INDEX IF NOT EXISTS idx_dev_subs_revolut_sub
  ON developer_subscriptions (revolut_subscription_id)
  WHERE revolut_subscription_id IS NOT NULL;

-- Tier lookup: active or cancelled subscriptions with valid period
CREATE INDEX IF NOT EXISTS idx_dev_subs_period
  ON developer_subscriptions (account_id, current_period_end DESC);

COMMENT ON TABLE  developer_subscriptions IS 'Developer subscription records for paid API tiers (pro, scale).';
COMMENT ON COLUMN developer_subscriptions.account_id IS 'NEAR account ID that owns this subscription';
COMMENT ON COLUMN developer_subscriptions.tier IS 'Subscription tier: pro or scale';
COMMENT ON COLUMN developer_subscriptions.status IS 'pending, active, cancelled, past_due, or expired';
COMMENT ON COLUMN developer_subscriptions.current_period_end IS 'End of current billing period — tier access continues until this date even after cancellation';
