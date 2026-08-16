/**
 * Passkey / biometric unlock for messaging keys.
 * Uses WebAuthn PRF when available; otherwise returns unsupported.
 */

import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

export type PasskeyWrapResult =
  | { ok: true; wrapKey: Uint8Array; credentialId: string }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'failed' };

const PRF_SALT = new TextEncoder().encode('onsocial-dm-prf-v1');

function bufferSourceToBytes(value: BufferSource): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function credentialIdToBase64(rawId: ArrayBuffer): string {
  return encodeBase64(new Uint8Array(rawId));
}

function readPrfFirst(
  cred: PublicKeyCredential | null
): Uint8Array | null {
  if (!cred) return null;
  const ext = cred.getClientExtensionResults() as {
    prf?: { results?: { first?: BufferSource }; enabled?: boolean };
  };
  const first = ext.prf?.results?.first;
  if (!first) return null;
  const bytes = bufferSourceToBytes(first);
  return bytes.length >= 32 ? bytes.slice(0, 32) : null;
}

export function isDmPasskeySupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  return typeof navigator.credentials?.create === 'function';
}

async function getPrfWrapKey(opts: {
  accountId: string;
  credentialId?: string;
}): Promise<PasskeyWrapResult> {
  if (!isDmPasskeySupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const rpId = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials = opts.credentialId
    ? [
        {
          type: 'public-key' as const,
          id: decodeBase64(opts.credentialId).slice().buffer as ArrayBuffer,
        },
      ]
    : undefined;

  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId,
        userVerification: 'required',
        timeout: 60_000,
        ...(allowCredentials ? { allowCredentials } : {}),
        extensions: {
          prf: { eval: { first: PRF_SALT } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    const wrapKey = readPrfFirst(cred);
    if (!cred || !wrapKey) {
      return { ok: false, reason: 'unsupported' };
    }
    return {
      ok: true,
      wrapKey,
      credentialId: credentialIdToBase64(cred.rawId),
    };
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError')
    ) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Create a platform passkey with PRF enabled, then derive the wrap key via get().
 */
export async function enrollDmPasskey(opts: {
  accountId: string;
}): Promise<PasskeyWrapResult> {
  if (!isDmPasskeySupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const rpId = window.location.hostname;
  const accountId = opts.accountId.trim().toLowerCase();
  const userId = new TextEncoder().encode(`onsocial-dm:${accountId}`);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const created = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'OnSocial', id: rpId },
        user: {
          id: userId,
          name: accountId,
          displayName: accountId,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
        // Signal PRF intent at create; derive on the following get().
        extensions: {
          prf: {},
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!created) return { ok: false, reason: 'cancelled' };

    // Prefer PRF from create when the platform returns it; otherwise get().
    const fromCreate = readPrfFirst(created);
    if (fromCreate) {
      return {
        ok: true,
        wrapKey: fromCreate,
        credentialId: credentialIdToBase64(created.rawId),
      };
    }

    return getPrfWrapKey({
      accountId,
      credentialId: credentialIdToBase64(created.rawId),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'NotAllowedError' || error.name === 'AbortError')
    ) {
      return { ok: false, reason: 'cancelled' };
    }
    return { ok: false, reason: 'failed' };
  }
}

/** Unlock: derive wrap key from an enrolled credential via PRF. */
export async function unlockDmPasskey(opts: {
  accountId: string;
  credentialId: string;
}): Promise<PasskeyWrapResult> {
  return getPrfWrapKey({
    accountId: opts.accountId,
    credentialId: opts.credentialId,
  });
}
