-- Per-message ephemeral pubkey for forward-secrecy seals (v2).
ALTER TABLE dm_messages
  ADD COLUMN IF NOT EXISTS ephemeral_pubkey TEXT;

COMMENT ON COLUMN dm_messages.ephemeral_pubkey IS
  'nacl.box ephemeral public key (base64); null = legacy identity-key seal.';
