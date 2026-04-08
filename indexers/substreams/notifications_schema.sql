-- ============================================================================
-- OnSocial Notifications Schema
-- ============================================================================
-- Cross-contract unified notifications table.
-- Populated by a backend notification worker that polls the raw event tables
-- and fans out actionable events to target users.
--
-- This is NOT a materialized view — it's a write-ahead table that the
-- notification worker INSERT-s into, and the API reads from.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Who receives this notification
  recipient TEXT NOT NULL,

  -- Who triggered the action
  actor TEXT NOT NULL,

  -- Notification type (determines icon, copy, and deep-link in UI)
  notification_type TEXT NOT NULL,
  -- Core types (convention, not enforced — apps can add their own):
  --   standing_new       — someone started standing with you
  --   reply              — someone replied to your post
  --   quote              — someone quoted your post
  --   reaction           — someone reacted to your post
  --   mention            — someone mentioned you in a post
  --   reward_credited    — you received a reward credit
  --   reward_claimed     — your claim succeeded
  --   group_invite       — you were invited to a group
  --   group_join_request — someone requested to join your group
  --   group_proposal     — new proposal in your group
  --   nft_sold           — your NFT was purchased
  --   nft_offer          — someone made an offer on your NFT
  --   boost_unlocked     — your boost lock expired
  -- Apps extend freely: guild_joined, endorsement_new, delegate_new, etc.

  -- Source contract (core, boost, rewards, scarces, token)
  source_contract TEXT NOT NULL,

  -- Link back to the source event
  source_receipt_id TEXT,
  source_block_height BIGINT,

  -- Contextual data (varies by type)
  -- e.g., post_id, group_id, token_id, amount, collection_id
  context JSONB NOT NULL DEFAULT '{}',

  -- Read state
  read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ
);

-- Fast per-user queries (most common: "my unread notifications")
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient, created_at DESC) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_all
  ON notifications(recipient, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications(notification_type);

CREATE INDEX IF NOT EXISTS idx_notifications_source_block
  ON notifications(source_contract, source_block_height);

-- ────────────────────────────────────────────────────────────────────────────
-- Notification worker cursor tracking
-- ────────────────────────────────────────────────────────────────────────────
-- The worker stores the last-processed block_height per source table.
-- On each poll cycle, it queries rows > last_block_height, processes them,
-- then updates the cursor.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_cursors (
  source_table TEXT PRIMARY KEY,
  last_block_height BIGINT NOT NULL DEFAULT 0,
  last_processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed cursors for all source tables
INSERT INTO notification_cursors (source_table) VALUES
  ('data_updates'),
  ('group_updates'),
  ('rewards_events'),
  ('boost_events'),
  ('scarces_events')
ON CONFLICT (source_table) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Notification count cache (per-user unread count)
-- ────────────────────────────────────────────────────────────────────────────
-- Updated by a trigger on INSERT/UPDATE to notifications.
-- The API reads this instead of COUNT(*) for badge numbers.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_counts (
  account_id TEXT PRIMARY KEY,
  unread_count INTEGER NOT NULL DEFAULT 0
);

-- Trigger to maintain unread counts
CREATE OR REPLACE FUNCTION update_notification_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notification_counts (account_id, unread_count)
    VALUES (NEW.recipient, 1)
    ON CONFLICT (account_id) DO UPDATE
      SET unread_count = notification_counts.unread_count + 1;
  ELSIF TG_OP = 'UPDATE' AND OLD.read = false AND NEW.read = true THEN
    UPDATE notification_counts
    SET unread_count = GREATEST(unread_count - 1, 0)
    WHERE account_id = NEW.recipient;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_count ON notifications;
CREATE TRIGGER trg_notification_count
  AFTER INSERT OR UPDATE OF read ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_notification_count();

-- ────────────────────────────────────────────────────────────────────────────
-- Helper: mark all notifications read for a user
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION mark_notifications_read(p_recipient TEXT) RETURNS INTEGER AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE notifications
  SET read = true, read_at = NOW()
  WHERE recipient = p_recipient AND read = false;
  GET DIAGNOSTICS affected = ROW_COUNT;

  UPDATE notification_counts
  SET unread_count = 0
  WHERE account_id = p_recipient;

  RETURN affected;
END;
$$ LANGUAGE plpgsql;
