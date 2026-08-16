import type { OnSocial } from '@onsocial/sdk';
import {
  DM_PUBKEY_PROFILE_KEY,
  DM_WRAP_PROFILE_KEY,
  decodeDmPublicKey,
} from '@/lib/dm/crypto';

export type DmKeyBackup = {
  publicKey: string;
  wrapped: { ciphertext: string; nonce: string };
};

/** Publish messaging public key under profile for recipients to seal to. */
export async function publishDmPublicKey(
  client: OnSocial,
  publicKeyEncoded: string
): Promise<void> {
  await client.social.set(`profile/${DM_PUBKEY_PROFILE_KEY}`, publicKeyEncoded);
}

/**
 * Publish pubkey + recovery-wrapped secret so another device can restore
 * with the recovery code. The wrap is ciphertext-only (not the secret).
 */
export async function publishDmKeyBackup(
  client: OnSocial,
  backup: DmKeyBackup
): Promise<void> {
  await client.social.set({
    [`profile/${DM_PUBKEY_PROFILE_KEY}`]: backup.publicKey,
    [`profile/${DM_WRAP_PROFILE_KEY}`]: JSON.stringify({
      v: 1,
      ciphertext: backup.wrapped.ciphertext,
      nonce: backup.wrapped.nonce,
      publicKey: backup.publicKey,
    }),
  });
}

/** Read a peer's messaging public key from their profile. */
export async function fetchDmPublicKey(
  client: OnSocial,
  accountId: string
): Promise<Uint8Array | null> {
  const id = accountId.trim().toLowerCase();
  try {
    const entry = await client.social.getOne(
      `profile/${DM_PUBKEY_PROFILE_KEY}`,
      id
    );
    const value = entry?.value;
    if (typeof value !== 'string' || !value.trim()) return null;
    return decodeDmPublicKey(value);
  } catch {
    return null;
  }
}

/** Fetch this account's recovery wrap from social (for new-device unlock). */
export async function fetchDmKeyBackup(
  client: OnSocial,
  accountId: string
): Promise<DmKeyBackup | null> {
  const id = accountId.trim().toLowerCase();
  try {
    const entry = await client.social.getOne(
      `profile/${DM_WRAP_PROFILE_KEY}`,
      id
    );
    const value = entry?.value;
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = JSON.parse(value) as {
      ciphertext?: string;
      nonce?: string;
      publicKey?: string;
    };
    const ciphertext = parsed.ciphertext?.trim() ?? '';
    const nonce = parsed.nonce?.trim() ?? '';
    let publicKey = parsed.publicKey?.trim() ?? '';
    if (!publicKey) {
      const pk = await client.social.getOne(
        `profile/${DM_PUBKEY_PROFILE_KEY}`,
        id
      );
      publicKey =
        typeof pk?.value === 'string' ? pk.value.trim() : '';
    }
    if (!ciphertext || !nonce || !publicKey) return null;
    decodeDmPublicKey(publicKey);
    return { publicKey, wrapped: { ciphertext, nonce } };
  } catch {
    return null;
  }
}
