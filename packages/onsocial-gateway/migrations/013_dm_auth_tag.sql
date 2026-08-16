-- Sender-authenticated MAC on DM envelopes (client-verified; stored opaque).
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS auth_tag TEXT;

COMMENT ON COLUMN dm_messages.auth_tag IS
  'Optional sender MAC (base64); binds identity key to ciphertext. Null = legacy.';
