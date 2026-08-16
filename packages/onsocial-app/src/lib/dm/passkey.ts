/**
 * Passkey / biometric unlock for messaging keys.
 * Uses WebAuthn PRF when available; otherwise returns unsupported.
 */

export type PasskeyWrapResult =
  | { ok: true; wrapKey: Uint8Array }
  | { ok: false; reason: 'unsupported' | 'cancelled' | 'failed' };

function bufferSourceToBytes(value: BufferSource): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

export function isDmPasskeySupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  return typeof navigator.credentials?.create === 'function';
}

/**
 * Derive a 32-byte wrap key via WebAuthn PRF when the extension exists.
 * Falls back to unsupported so callers use recovery code instead.
 */
export async function deriveDmPasskeyWrapKey(opts: {
  accountId: string;
  createIfMissing?: boolean;
}): Promise<PasskeyWrapResult> {
  if (!isDmPasskeySupported()) {
    return { ok: false, reason: 'unsupported' };
  }

  const rpId = window.location.hostname;
  const userId = new TextEncoder().encode(
    `onsocial-dm:${opts.accountId.trim().toLowerCase()}`
  );
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'OnSocial', id: rpId },
        user: {
          id: userId,
          name: opts.accountId,
          displayName: opts.accountId,
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
        extensions: {
          // PRF — ignored on browsers that don't support it.
          prf: { eval: { first: new TextEncoder().encode('onsocial-dm-v1') } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!cred) return { ok: false, reason: 'cancelled' };

    const ext = cred.getClientExtensionResults() as {
      prf?: { results?: { first?: BufferSource } };
    };
    const first = ext.prf?.results?.first;
    if (!first) {
      return { ok: false, reason: 'unsupported' };
    }
    const bytes = bufferSourceToBytes(first);
    if (bytes.length < 32) return { ok: false, reason: 'unsupported' };
    return { ok: true, wrapKey: bytes.slice(0, 32) };
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
