import type { OnSocial } from '@onsocial/sdk';
import {
  DM_PUBKEY_PROFILE_KEY,
  decodeDmPublicKey,
} from '@/lib/dm/crypto';

/** Publish messaging public key under profile for recipients to seal to. */
export async function publishDmPublicKey(
  client: OnSocial,
  publicKeyEncoded: string
): Promise<void> {
  await client.social.set(`profile/${DM_PUBKEY_PROFILE_KEY}`, publicKeyEncoded);
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
