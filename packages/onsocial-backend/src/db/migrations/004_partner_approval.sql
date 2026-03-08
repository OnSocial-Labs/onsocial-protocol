-- =============================================================================
-- Partner approval gating
-- =============================================================================

-- Add status + application details to partner_keys
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS wallet_id TEXT;
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS expected_users TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS contact TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS admin_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE partner_keys ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Existing rows get 'approved' status (backward compat)
UPDATE partner_keys SET status = 'approved' WHERE status = 'pending' AND api_key IS NOT NULL AND api_key != '';

-- Allow NULL api_key for pending applications (NULLs don't violate UNIQUE)
ALTER TABLE partner_keys ALTER COLUMN api_key DROP NOT NULL;
ALTER TABLE partner_keys ALTER COLUMN api_key SET DEFAULT NULL;

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_partner_keys_status ON partner_keys (status);
CREATE INDEX IF NOT EXISTS idx_partner_keys_wallet ON partner_keys (wallet_id) WHERE wallet_id IS NOT NULL;
