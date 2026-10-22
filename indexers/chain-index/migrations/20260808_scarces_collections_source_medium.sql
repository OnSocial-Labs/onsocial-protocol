-- Post ↔ Drop discovery: source post path + normalized medium on live drops.

ALTER TABLE scarces_collections_current
  ADD COLUMN IF NOT EXISTS medium_kind TEXT;

ALTER TABLE scarces_collections_current
  ADD COLUMN IF NOT EXISTS source_post_path TEXT;

CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_medium_kind
  ON scarces_collections_current(medium_kind);
CREATE INDEX IF NOT EXISTS idx_scarces_collections_current_source_post
  ON scarces_collections_current(source_post_path);

-- Backfill from stored extra_json / kind / metadata_template.
UPDATE scarces_collections_current
SET
  medium_kind = CASE
    WHEN lower(coalesce(
      CASE
        WHEN extra_json IS NOT NULL AND left(ltrim(extra_json), 1) = '{'
          THEN extra_json::json->>'kind'
        ELSE NULL
      END,
      kind,
      ''
    )) = 'music' THEN 'audio'
    WHEN coalesce(
      CASE
        WHEN extra_json IS NOT NULL AND left(ltrim(extra_json), 1) = '{'
          THEN extra_json::json->>'kind'
        ELSE NULL
      END,
      kind,
      ''
    ) <> ''
      THEN lower(coalesce(
        CASE
          WHEN extra_json IS NOT NULL AND left(ltrim(extra_json), 1) = '{'
            THEN extra_json::json->>'kind'
          ELSE NULL
        END,
        kind
      ))
    ELSE medium_kind
  END,
  source_post_path = COALESCE(
    source_post_path,
    CASE
      WHEN extra_json IS NOT NULL
        AND left(ltrim(extra_json), 1) = '{'
        AND coalesce(extra_json::json->'sourcePost'->>'path', '') <> ''
        THEN extra_json::json->'sourcePost'->>'path'
      WHEN extra_json IS NOT NULL
        AND left(ltrim(extra_json), 1) = '{'
        AND coalesce(extra_json::json->'sourcePost'->>'author', '') <> ''
        AND coalesce(extra_json::json->'sourcePost'->>'postId', '') <> ''
        THEN (extra_json::json->'sourcePost'->>'author')
          || '/post/'
          || (extra_json::json->'sourcePost'->>'postId')
      WHEN metadata_template IS NOT NULL
        AND left(ltrim(metadata_template), 1) = '{'
        AND coalesce(
          (metadata_template::json->>'extra')::json->'sourcePost'->>'path',
          ''
        ) <> ''
        THEN (metadata_template::json->>'extra')::json->'sourcePost'->>'path'
      ELSE NULL
    END
  )
WHERE medium_kind IS NULL
   OR source_post_path IS NULL;
