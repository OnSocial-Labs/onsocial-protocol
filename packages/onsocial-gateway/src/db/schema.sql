-- OnSocial Gateway Database Schema
-- Credit tracking and usage analytics

-- Developer accounts (credit pool)
CREATE TABLE IF NOT EXISTS developers (
  account_id TEXT PRIMARY KEY,
  credit_balance BIGINT NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'free',
  locked_usd_value DECIMAL(10,2),
  free_writes_used INT NOT NULL DEFAULT 0,  -- Resets monthly
  free_writes_reset_at TIMESTAMP DEFAULT date_trunc('month', NOW() + INTERVAL '1 month'),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Apps owned by developers (optional grouping for analytics)
CREATE TABLE IF NOT EXISTS apps (
  app_id TEXT PRIMARY KEY,
  developer_account_id TEXT REFERENCES developers(account_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Write operation logs (uploads/relays only, reads are free)
CREATE TABLE IF NOT EXISTS write_logs (
  id BIGSERIAL PRIMARY KEY,
  developer_account_id TEXT NOT NULL,
  app_id TEXT,  -- NULL if developer didn't specify
  operation TEXT NOT NULL,  -- 'ipfs_upload', 'relay_tx'
  credits_used INT NOT NULL,  -- 0 if used free allocation
  used_free_allocation BOOLEAN NOT NULL DEFAULT false,
  file_size_mb DECIMAL(10,2),  -- For uploads
  endpoint TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  request_metadata JSONB  -- IP, user agent, etc.
);

-- Credit purchase history (from contract events)
CREATE TABLE IF NOT EXISTS credit_purchases (
  id BIGSERIAL PRIMARY KEY,
  developer_account_id TEXT NOT NULL,
  social_amount DECIMAL(24,18) NOT NULL,  -- SOCIAL tokens sent
  social_price_usd DECIMAL(10,4) NOT NULL,  -- Price at purchase time
  credits_received BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_writes_developer ON write_logs(developer_account_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_writes_app ON write_logs(app_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_writes_timestamp ON write_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_developer ON credit_purchases(developer_account_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_developers_tier ON developers(tier);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_developers_updated_at BEFORE UPDATE ON developers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
