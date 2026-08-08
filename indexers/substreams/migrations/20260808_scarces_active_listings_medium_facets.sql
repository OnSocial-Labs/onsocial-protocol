-- Discovery columns for Market filters (medium / audio format / facets).
-- Extracted from NEP-177 extra_json; listing `kind` stays lazy|native|auction.

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS medium_kind TEXT;

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS audio_format TEXT;

ALTER TABLE scarces_active_listings
  ADD COLUMN IF NOT EXISTS facets TEXT[];

CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_medium_kind
  ON scarces_active_listings(medium_kind);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_audio_format
  ON scarces_active_listings(audio_format);
CREATE INDEX IF NOT EXISTS idx_scarces_active_listings_facets
  ON scarces_active_listings USING GIN (facets);

-- Backfill live catalog from stored extra_json (object blobs only).
UPDATE scarces_active_listings
SET
  medium_kind = CASE
    WHEN lower(coalesce(extra_json::json->>'kind', '')) = 'music' THEN 'audio'
    WHEN coalesce(extra_json::json->>'kind', '') <> ''
      THEN lower(extra_json::json->>'kind')
    ELSE medium_kind
  END,
  audio_format = CASE
    WHEN coalesce(extra_json::json->>'audioFormat', '') <> ''
      THEN lower(extra_json::json->>'audioFormat')
    ELSE audio_format
  END,
  facets = (
    SELECT array_agg(DISTINCT lower(trim(f)))
    FILTER (WHERE length(trim(f)) > 0)
    FROM jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(extra_json::jsonb->'facets') = 'array'
          THEN extra_json::jsonb->'facets'
        ELSE '[]'::jsonb
      END
    ) AS f
  )
WHERE extra_json IS NOT NULL
  AND left(ltrim(extra_json), 1) = '{';
