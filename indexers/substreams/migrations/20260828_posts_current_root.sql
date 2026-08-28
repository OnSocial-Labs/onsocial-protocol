-- Thread root on posts_current so Pulse can card the conversation, not the
-- immediate parent. Derived from parent_path at write time; not an on-chain field.

ALTER TABLE posts_current
  ADD COLUMN IF NOT EXISTS root_path TEXT NOT NULL DEFAULT '';
ALTER TABLE posts_current
  ADD COLUMN IF NOT EXISTS root_author TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_posts_current_root
  ON posts_current(root_path)
  WHERE root_path IS NOT NULL AND root_path != '';

CREATE OR REPLACE FUNCTION posts_current_own_path(
  p_account_id text,
  p_post_id text,
  p_group_id text
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_group_id IS NOT NULL AND btrim(p_group_id) <> ''
      THEN p_account_id || '/groups/' || p_group_id || '/content/post/' || p_post_id
    ELSE p_account_id || '/post/' || p_post_id
  END;
$$;

CREATE OR REPLACE FUNCTION parse_post_content_path(p_path text)
RETURNS TABLE(account_id text, post_id text, group_id text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_path ~ '^[^/]+/groups/[^/]+/content/post/.+$'
        THEN split_part(p_path, '/', 1)
      WHEN p_path ~ '^[^/]+/post/.+$'
        THEN split_part(p_path, '/', 1)
      ELSE NULL
    END,
    CASE
      WHEN p_path ~ '^[^/]+/groups/[^/]+/content/post/.+$'
        THEN substring(p_path from '/content/post/(.+)$')
      WHEN p_path ~ '^[^/]+/post/.+$'
        THEN substring(p_path from '^[^/]+/post/(.+)$')
      ELSE NULL
    END,
    CASE
      WHEN p_path ~ '^[^/]+/groups/[^/]+/content/post/.+$'
        THEN split_part(p_path, '/', 3)
      ELSE NULL
    END;
$$;

CREATE OR REPLACE FUNCTION posts_current_set_root()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_row posts_current%ROWTYPE;
  parsed record;
BEGIN
  IF NEW.parent_path IS NULL OR btrim(NEW.parent_path) = '' THEN
    NEW.root_path := posts_current_own_path(
      NEW.account_id,
      NEW.post_id,
      NEW.group_id
    );
    NEW.root_author := NEW.account_id;
    RETURN NEW;
  END IF;

  SELECT * INTO parsed FROM parse_post_content_path(NEW.parent_path);
  IF parsed.account_id IS NOT NULL THEN
    SELECT p.* INTO parent_row
    FROM posts_current p
    WHERE p.account_id = parsed.account_id
      AND p.post_id = parsed.post_id
      AND (
        (
          parsed.group_id IS NULL
          AND (p.group_id IS NULL OR p.group_id = '')
        )
        OR p.group_id = parsed.group_id
      );
  END IF;

  IF parent_row.account_id IS NOT NULL THEN
    IF parent_row.root_path IS NOT NULL AND btrim(parent_row.root_path) <> '' THEN
      NEW.root_path := parent_row.root_path;
      NEW.root_author := parent_row.root_author;
    ELSE
      NEW.root_path := posts_current_own_path(
        parent_row.account_id,
        parent_row.post_id,
        parent_row.group_id
      );
      NEW.root_author := parent_row.account_id;
    END IF;
  ELSE
    NEW.root_path := NEW.parent_path;
    NEW.root_author := COALESCE(
      NULLIF(btrim(COALESCE(NEW.parent_author, '')), ''),
      split_part(NEW.parent_path, '/', 1)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_current_set_root ON posts_current;
CREATE TRIGGER trg_posts_current_set_root
BEFORE INSERT OR UPDATE OF parent_path, parent_author, account_id, post_id, group_id
ON posts_current
FOR EACH ROW
EXECUTE FUNCTION posts_current_set_root();

-- When a parent is indexed later, push its root down to replies that
-- landed first (they stored parent_path as a fallback root).
CREATE OR REPLACE FUNCTION posts_current_cascade_root()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.root_path IS NULL OR btrim(NEW.root_path) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.root_path IS NOT DISTINCT FROM NEW.root_path
    AND OLD.root_author IS NOT DISTINCT FROM NEW.root_author
    AND OLD.account_id IS NOT DISTINCT FROM NEW.account_id
    AND OLD.post_id IS NOT DISTINCT FROM NEW.post_id
    AND OLD.group_id IS NOT DISTINCT FROM NEW.group_id
  THEN
    RETURN NEW;
  END IF;

  UPDATE posts_current child
  SET
    root_path = NEW.root_path,
    root_author = NEW.root_author
  WHERE child.parent_path = posts_current_own_path(
      NEW.account_id,
      NEW.post_id,
      NEW.group_id
    )
    AND (
      child.root_path IS DISTINCT FROM NEW.root_path
      OR child.root_author IS DISTINCT FROM NEW.root_author
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_current_cascade_root ON posts_current;
CREATE TRIGGER trg_posts_current_cascade_root
AFTER INSERT OR UPDATE OF root_path, root_author, account_id, post_id, group_id
ON posts_current
FOR EACH ROW
EXECUTE FUNCTION posts_current_cascade_root();

-- Fill existing rows, then walk nested replies until roots stabilize.
UPDATE posts_current
SET parent_path = parent_path;

DO $$
DECLARE
  changed integer;
BEGIN
  LOOP
    UPDATE posts_current child
    SET
      root_path = matches.next_root_path,
      root_author = matches.next_root_author
    FROM (
      SELECT
        c.ctid AS child_ctid,
        CASE
          WHEN parent.root_path IS NOT NULL AND btrim(parent.root_path) <> ''
            THEN parent.root_path
          ELSE posts_current_own_path(
            parent.account_id,
            parent.post_id,
            parent.group_id
          )
        END AS next_root_path,
        CASE
          WHEN parent.root_author IS NOT NULL AND btrim(parent.root_author) <> ''
            THEN parent.root_author
          ELSE parent.account_id
        END AS next_root_author
      FROM posts_current c
      JOIN LATERAL parse_post_content_path(c.parent_path) parsed ON true
      JOIN posts_current parent
        ON parent.account_id = parsed.account_id
       AND parent.post_id = parsed.post_id
       AND (
         (
           parsed.group_id IS NULL
           AND (parent.group_id IS NULL OR parent.group_id = '')
         )
         OR parent.group_id = parsed.group_id
       )
      WHERE c.parent_path IS NOT NULL
        AND btrim(c.parent_path) <> ''
    ) matches
    WHERE child.ctid = matches.child_ctid
      AND (
        child.root_path IS DISTINCT FROM matches.next_root_path
        OR child.root_author IS DISTINCT FROM matches.next_root_author
      );
    GET DIAGNOSTICS changed = ROW_COUNT;
    EXIT WHEN changed = 0;
  END LOOP;
END;
$$;
