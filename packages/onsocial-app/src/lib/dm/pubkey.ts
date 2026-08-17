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

function backupsEqual(a: DmKeyBackup, b: DmKeyBackup): boolean {
  return (
    a.publicKey === b.publicKey &&
    a.wrapped.ciphertext === b.wrapped.ciphertext &&
    a.wrapped.nonce === b.wrapped.nonce
  );
}

/** Publish messaging public key under profile for recipients to seal to. */
export async function publishDmPublicKey(
  client: OnSocial,
  publicKeyEncoded: string,
  accountId: string
): Promise<void> {
  await client.social.set(`profile/${DM_PUBKEY_PROFILE_KEY}`, publicKeyEncoded, {
    wait: true,
  });
  const readback = await lookupDmPublicKey(client, accountId);
  if (readback.status !== 'found') {
    throw new Error(
      'Messaging key publish did not confirm on-chain. Try again.'
    );
  }
  if (encodeDmPublicKey(readback.value) !== publicKeyEncoded) {
    throw new Error(
      'Messaging key publish did not match after confirmation. Try again.'
    );
  }
}

/**
 * Publish pubkey + recovery-wrapped secret so another device can restore
 * with the recovery code. The wrap is ciphertext-only (not the secret).
 * Waits for chain confirmation and verifies readback before returning.
 */
export async function publishDmKeyBackup(
  client: OnSocial,
  backup: DmKeyBackup,
  accountId: string
): Promise<void> {
  await client.social.set(
    {
      [`profile/${DM_PUBKEY_PROFILE_KEY}`]: backup.publicKey,
      [`profile/${DM_WRAP_PROFILE_KEY}`]: JSON.stringify({
        v: 1,
        ciphertext: backup.wrapped.ciphertext,
        nonce: backup.wrapped.nonce,
        publicKey: backup.publicKey,
      }),
    },
    { wait: true }
  );

  const wrapReadback = await lookupDmKeyBackup(client, accountId);
  if (
    wrapReadback.status !== 'found' ||
    !backupsEqual(wrapReadback.value, backup)
  ) {
    throw new Error(
      'Messaging backup publish did not confirm on-chain. Try again before sending.'
    );
  }
  const pkReadback = await lookupDmPublicKey(client, accountId);
  if (pkReadback.status !== 'found') {
    throw new Error(
      'Messaging key publish did not confirm on-chain. Try again.'
    );
  }
  if (encodeDmPublicKey(pkReadback.value) !== backup.publicKey) {
    throw new Error(
      'Messaging key publish did not match after confirmation. Try again.'
    );
  }
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
 * Uses chain-confirmed publish + readback before returning.
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
    // Cross-check profile pubkey vs wrap pubkey when both exist.
    const remotePk = await lookupDmPublicKey(opts.client, opts.accountId);
    if (remotePk.status === 'unavailable') {
      throw new Error(
        'Could not verify messaging keys on your profile. Try again.'
      );
    }
    if (remotePk.status === 'found') {
      const encoded = encodeDmPublicKey(remotePk.value);
      if (encoded !== remote.value.publicKey) {
        throw new Error(
          'Your profile messaging keys are inconsistent. Restore with your recovery code before sending.'
        );
      }
    } else if (opts.backup) {
      // Wrap matches but pubkey missing — republish both with confirm.
      await publishDmKeyBackup(opts.client, opts.backup, opts.accountId);
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
      await publishDmKeyBackup(opts.client, opts.backup, opts.accountId);
    }
    return;
  }

  if (opts.backup) {
    await publishDmKeyBackup(opts.client, opts.backup, opts.accountId);
    return;
  }
  if (opts.created || opts.publicKeyEncoded) {
    await publishDmPublicKey(opts.client, opts.publicKeyEncoded, opts.accountId);
  }
}
