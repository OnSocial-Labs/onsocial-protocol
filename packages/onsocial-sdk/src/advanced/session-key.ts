// Shared session key types.

/**
 * Ed25519 signer over raw message bytes.
 *
 * The signer receives the raw `message` bytes and returns a 64-byte Ed25519
 * signature. For NEP-366 the message is a SHA-256 digest; for other call
 * sites it may be the raw message — see each caller for the exact convention.
 */
export type SignerFn = (
  message: Uint8Array
) => Uint8Array | Promise<Uint8Array>;

/** Client-held session key. */
export interface SessionKey {
  publicKey: string;
  sign: SignerFn;
  scope?: string;
  expiresAtMs?: number;
}
