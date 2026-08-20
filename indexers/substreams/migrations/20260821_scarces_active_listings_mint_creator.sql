-- Backfill mint creator on native/auction listings from the drop collection.
-- Historical list_native / auction_created events omitted creator_id; seller was
-- never written to creator_id either (column stayed NULL). New contract emits
-- token.creator_id; this joins edition tokens `collection:seat` to catalog.

UPDATE scarces_active_listings AS l
SET creator_id = c.creator_id
FROM scarces_collections_current AS c
WHERE l.kind IN ('native', 'auction')
  AND l.token_id IS NOT NULL
  AND l.token_id NOT LIKE 's:%'
  AND position(':' IN l.token_id) > 0
  AND left(
    l.token_id,
    length(l.token_id) - position(':' IN reverse(l.token_id))
  ) = c.collection_id
  AND nullif(trim(c.creator_id), '') IS NOT NULL
  AND c.creator_id <> 'unknown'
  AND nullif(trim(l.creator_id), '') IS NULL;
