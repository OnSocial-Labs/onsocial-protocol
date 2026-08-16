-- Private DM mailbox (ciphertext envelopes only).
-- Auth'd gateway API scopes access to JWT account as sender or recipient.

CREATE TABLE IF NOT EXISTS dm_messages (
  id                TEXT        PRIMARY KEY,
  thread_id         TEXT        NOT NULL,
  sender_account_id TEXT        NOT NULL,
  recipient_account_id TEXT     NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Sealed payload (base64). Never store plaintext body.
  ciphertext        TEXT        NOT NULL,
  nonce             TEXT        NOT NULL,
  -- Self-sealed copy so the sender can decrypt their own sent messages.
  sender_ciphertext TEXT,
  sender_nonce      TEXT,
  -- Optional sealed media descriptors (JSON array of {cid,mime,size,nonce}).
  media_json        TEXT,
  sender_pubkey     TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_thread_created
  ON dm_messages(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_messages_recipient_created
  ON dm_messages(recipient_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_messages_sender_created
  ON dm_messages(sender_account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_thread_reads (
  account_id TEXT NOT NULL,
  thread_id  TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, thread_id)
);

COMMENT ON TABLE dm_messages IS 'E2EE DM envelopes — ciphertext only; viewer-scoped via gateway auth.';
COMMENT ON COLUMN dm_messages.ciphertext IS 'nacl.box ciphertext (base64); plaintext never stored.';
