-- Resales (native/auction) often listed without extra.kind. Inherit the mint
-- stamp so Market kind chips (Thoughts / Art / Audio / …) include them.

-- extra_json stored as a JSON string of a JSON object.
UPDATE scarces_active_listings
SET
  medium_kind = CASE
    WHEN lower(coalesce((extra_json::json #>> '{}')::json->>'kind', '')) = 'music'
      THEN 'audio'
    WHEN coalesce((extra_json::json #>> '{}')::json->>'kind', '') <> ''
      THEN lower((extra_json::json #>> '{}')::json->>'kind')
    ELSE medium_kind
  END
WHERE medium_kind IS NULL
  AND extra_json IS NOT NULL
  AND left(ltrim(extra_json), 1) = '"';

-- Drop editions: inherit collection medium (`drop-id:seat`).
UPDATE scarces_active_listings AS listing
SET
  medium_kind = CASE
    WHEN lower(collection.medium_kind) = 'music' THEN 'audio'
    ELSE lower(collection.medium_kind)
  END
FROM scarces_collections_current AS collection
WHERE listing.medium_kind IS NULL
  AND collection.medium_kind IS NOT NULL
  AND trim(collection.medium_kind) <> ''
  AND listing.token_id IS NOT NULL
  AND strpos(listing.token_id, ':') > 1
  AND left(listing.token_id, length(collection.collection_id) + 1)
    = collection.collection_id || ':';

-- Post-linked listings with no medium — typical thought resale / old mint.
UPDATE scarces_active_listings
SET medium_kind = 'thought'
WHERE medium_kind IS NULL
  AND source_post_path IS NOT NULL
  AND trim(source_post_path) <> '';
