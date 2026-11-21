-- Topic junction views: expose content_path for composite keyset paging.

CREATE OR REPLACE VIEW post_hashtags AS
SELECT
  p.account_id,
  p.post_id,
  lower(trim(ht.tag)) AS hashtag,
  p.block_height,
  p.block_timestamp,
  p.group_id,
  post_content_path(p.account_id, p.post_id, p.group_id) AS content_path,
  COALESCE(h.heat, 0)::double precision AS heat
FROM posts_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  (
    CASE
      WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
      ELSE NULL
    END
  ) -> 'hashtags'
) AS ht(tag)
LEFT JOIN post_amplify_heat h
  ON h.post_path = post_content_path(p.account_id, p.post_id, p.group_id)
WHERE p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^[\[\{]'
  AND jsonb_typeof(
    (
      CASE
        WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
        ELSE NULL
      END
    ) -> 'hashtags'
  ) = 'array'
  AND length(trim(ht.tag)) > 0;

CREATE OR REPLACE VIEW post_tickers AS
SELECT
  p.account_id,
  p.post_id,
  lower(trim(tk.sym)) AS ticker,
  p.block_height,
  p.block_timestamp,
  p.group_id,
  post_content_path(p.account_id, p.post_id, p.group_id) AS content_path,
  COALESCE(h.heat, 0)::double precision AS heat
FROM posts_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  (
    CASE
      WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
      ELSE NULL
    END
  ) -> 'tickers'
) AS tk(sym)
LEFT JOIN post_amplify_heat h
  ON h.post_path = post_content_path(p.account_id, p.post_id, p.group_id)
WHERE p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^[\[\{]'
  AND jsonb_typeof(
    (
      CASE
        WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
        ELSE NULL
      END
    ) -> 'tickers'
  ) = 'array'
  AND length(trim(tk.sym)) > 0;

CREATE OR REPLACE VIEW post_places AS
SELECT
  p.account_id,
  p.post_id,
  lower(trim(pl.place)) AS place,
  p.block_height,
  p.block_timestamp,
  p.group_id,
  post_content_path(p.account_id, p.post_id, p.group_id) AS content_path,
  COALESCE(h.heat, 0)::double precision AS heat
FROM posts_current p
CROSS JOIN LATERAL jsonb_array_elements_text(
  (
    CASE
      WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
      ELSE NULL
    END
  ) -> 'places'
) AS pl(place)
LEFT JOIN post_amplify_heat h
  ON h.post_path = post_content_path(p.account_id, p.post_id, p.group_id)
WHERE p.value IS NOT NULL
  AND p.value != ''
  AND p.value ~ '^[\[\{]'
  AND jsonb_typeof(
    (
      CASE
        WHEN p.value ~ '^[\[\{]' THEN p.value::jsonb
        ELSE NULL
      END
    ) -> 'places'
  ) = 'array'
  AND length(trim(pl.place)) > 0;