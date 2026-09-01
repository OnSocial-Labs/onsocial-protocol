-- Guild feed + room filters: ORDER BY block_height DESC LIMIT n on posts_current.
-- The existing idx_posts_current_group is group_id only, so room flips and
-- default feeds still sort the whole guild bag.

CREATE INDEX IF NOT EXISTS idx_posts_current_group_feed
  ON posts_current (group_id, is_group_content, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != '';

CREATE INDEX IF NOT EXISTS idx_posts_current_group_channel
  ON posts_current (group_id, channel, is_group_content, block_height DESC)
  WHERE group_id IS NOT NULL AND group_id != ''
    AND channel IS NOT NULL AND channel != '';
