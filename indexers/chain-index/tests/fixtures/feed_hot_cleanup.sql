DELETE FROM reactions_current
WHERE account_id IN ('hotfan1.near', 'hotfan2.near', 'hotfan3.near');

DELETE FROM posts_current
WHERE account_id IN ('hotfeed.near', 'hotfeed-src.near');

DO $$
BEGIN
  IF to_regclass('public.post_amplify_heat_state') IS NOT NULL THEN
    DELETE FROM post_amplify_heat_state
    WHERE post_path LIKE 'hotfeed.near/%'
       OR post_path LIKE 'hotfeed-src.near/%';
  END IF;
END $$;
