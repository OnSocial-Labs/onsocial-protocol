import type { OnSocial } from '@onsocial/sdk';
import {
  DM_PUBKEY_PROFILE_KEY,
  DM_WRAP_PROFILE_KEY,
  decodeDmPublicKey,
  encodeDmPublicKey,
} from '@/lib/dm/crypto';

export type DmKeyBackup = {
  publicKey: string;
  wrapped: { ciphertext: string; nonce: string };
};

/**
 * Distinguishes verified absence from transport/parse failures.
 * Never treat `unavailable` as "no keys" — that causes silent rotation.
 */
export type DmLookupResult<T> =
  | { status: 'found'; value: T }
  | { status: 'absent' }
  | { status: 'unavailable'; cause?: unknown };

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

/** Lookup a peer's messaging public key (tri-state). */
export async function lookupDmPublicKey(
  client: OnSocial,
  accountId: string
): Promise<DmLookupResult<Uint8Array>> {
  const id = accountId.trim().toLowerCase();
  try {
    const entry = await client.social.getOne(
      `profile/${DM_PUBKEY_PROFILE_KEY}`,
      id
    );
    const value = entry?.value;
    if (typeof value !== 'string' || !value.trim()) {
      return { status: 'absent' };
    }
    return { status: 'found', value: decodeDmPublicKey(value) };
  } catch (cause) {
    return { status: 'unavailable', cause };
  }
}

/** Read a peer's messaging public key when present. */
export async function fetchDmPublicKey(
  client: OnSocial,
  accountId: string
): Promise<Uint8Array | null> {
  const result = await lookupDmPublicKey(client, accountId);
  return result.status === 'found' ? result.value : null;
}

/** Lookup this account's recovery wrap from social (tri-state). */
export async function lookupDmKeyBackup(
  client: OnSocial,
  accountId: string
): Promise<DmLookupResult<DmKeyBackup>> {
  const id = accountId.trim().toLowerCase();
  try {
    const entry = await client.social.getOne(
      `profile/${DM_WRAP_PROFILE_KEY}`,
      id
    );
    const value = entry?.value;
    if (typeof value !== 'string' || !value.trim()) {
      return { status: 'absent' };
    }
    let parsed: {
      ciphertext?: string;
      nonce?: string;
      publicKey?: string;
    };
    try {
      parsed = JSON.parse(value) as {
        ciphertext?: string;
        nonce?: string;
        publicKey?: string;
      };
    } catch (cause) {
      return { status: 'unavailable', cause };
    }
    const ciphertext = parsed.ciphertext?.trim() ?? '';
    const nonce = parsed.nonce?.trim() ?? '';
    let publicKey = parsed.publicKey?.trim() ?? '';
    if (!publicKey) {
      const pkLookup = await lookupDmPublicKey(client, id);
      if (pkLookup.status === 'unavailable') return pkLookup;
      if (pkLookup.status === 'found') {
        publicKey = encodeDmPublicKey(pkLookup.value);
      }
    }
    if (!ciphertext || !nonce || !publicKey) {
      // Partial / corrupt wrap — do not mint over it.
      return {
        status: 'unavailable',
        cause: new Error('Incomplete messaging backup on profile'),
      };
    }
    try {
      decodeDmPublicKey(publicKey);
    } catch (cause) {
      return { status: 'unavailable', cause };
    }
    return {
      status: 'found',
      value: { publicKey, wrapped: { ciphertext, nonce } },
    };
  } catch (cause) {
    return { status: 'unavailable', cause };
  }
}

/** Fetch backup when present; null for absent *or* unavailable (legacy). Prefer {@link lookupDmKeyBackup}. */
export async function fetchDmKeyBackup(
  client: OnSocial,
  accountId: string
): Promise<DmKeyBackup | null> {
  const result = await lookupDmKeyBackup(client, accountId);
  return result.status === 'found' ? result.value : null;
}

/**
 * Publish local identity only when remote is verified absent / matching.
 * Never publishes when remote lookup is unavailable.
 */
export async function reconcileAndPublishDmIdentity(opts: {
  client: OnSocial;
  accountId: string;
  publicKeyEncoded: string;
  backup: DmKeyBackup | null;
  created: boolean;
}): Promise<void> {
  const remote = await lookupDmKeyBackup(opts.client, opts.accountId);
  if (remote.status === 'unavailable') {
    throw new Error(
      'Could not verify messaging keys on your profile. Try again.'
    );
  }

  if (remote.status === 'found') {
    if (remote.value.publicKey !== opts.publicKeyEncoded) {
      throw new Error(
        'This device’s messaging keys do not match your profile. Unlock with your recovery code, or contact support before sending.'
      );
    }
    // Remote wrap already matches — nothing to publish.
    return;
  }

  // Remote wrap absent — check pubkey-only publication.
  const remotePk = await lookupDmPublicKey(opts.client, opts.accountId);
  if (remotePk.status === 'unavailable') {
    throw new Error(
      'Could not verify messaging keys on your profile. Try again.'
    );
  }
  if (remotePk.status === 'found') {
    const encoded = encodeDmPublicKey(remotePk.value);
    if (encoded !== opts.publicKeyEncoded) {
      throw new Error(
        'This device’s messaging keys do not match your profile. Unlock with your recovery code before sending.'
      );
    }
    // Pubkey matches but wrap missing — publish wrap if we have one.
    if (opts.backup) {
      await publishDmKeyBackup(opts.client, opts.backup);
    }
    return;
  }

  if (opts.backup) {
    await publishDmKeyBackup(opts.client, opts.backup);
    return;
  }
  if (opts.created || opts.publicKeyEncoded) {
    await publishDmPublicKey(opts.client, opts.publicKeyEncoded);
  }
}
