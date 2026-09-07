export type E2eSignerRole = 'primary' | 'counterparty';

export interface E2eKeypair {
  accountId: string;
  secretKey: Buffer;
  publicKey: string;
  privateKey: string;
}

export function resolveE2eSignerAccount(
  role?: E2eSignerRole
): string | null;
export function resolveE2eSignerPrivateKey(
  role?: E2eSignerRole
): string | null;
export function base58Encode(bytes: Buffer): string;
export function base58Decode(encoded: string): Buffer;
export function ed25519PublicFromSeed(seed32: Buffer): Buffer;
export function decodeNearKeypair(
  accountId: string,
  privateKey: string
): E2eKeypair;
export function loadE2eKeypair(role?: E2eSignerRole): E2eKeypair | null;
export function e2eKeypairForAccount(accountId: string): E2eKeypair | null;
export function loadE2eSigners(): {
  primary: E2eKeypair | null;
  counterparty: E2eKeypair | null;
};
export function hasE2eSigner(role?: E2eSignerRole): boolean;
