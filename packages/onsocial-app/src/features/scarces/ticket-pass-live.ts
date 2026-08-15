/**
 * Live Show-pass QR (os2) — short-lived NEP-413 signature from the
 * holder's App social session key. Door verifies before admit.
 *
 * Format (pipe-separated; token ids may contain `:`):
 *   os2|{collection}|{token}|{expMs}|{pkB64u}|{nonceB64u}|{sigB64u}
 */

import type { Session } from '@onsocial/sdk/advanced';
import { base58Encode, parseEd25519PublicKey } from '@onsocial/sdk/advanced';
import {
  base64ToBytes,
  bytesToBase64,
  hashNep413Payload,
} from '@/lib/app-nep413';
import { accountOwnsPublicKey } from '@/lib/near-access-key';

export const TICKET_PASS_LIVE_PREFIX = 'os2';
export const TICKET_PASS_LIVE_RECIPIENT = 'onsocial.ticket.pass';
/** How long a signed QR stays valid at the door. */
export const TICKET_PASS_LIVE_TTL_MS = 45_000;
/** Re-sign while Show pass stays open (under TTL). */
export const TICKET_PASS_LIVE_REFRESH_MS = 30_000;
/** Reject proofs that claim expiry too far in the future. */
const TICKET_PASS_LIVE_MAX_AHEAD_MS = TICKET_PASS_LIVE_TTL_MS + 15_000;

export interface TicketPassLivePayload {
  collectionId: string;
  tokenId: string;
  expMs: number;
  /** Raw 32-byte ed25519 public key, base64url. */
  publicKeyB64u: string;
  nonceB64u: string;
  signatureB64u: string;
}

export type TicketPassLiveVerifyResult =
  | { ok: true; payload: TicketPassLivePayload }
  | { ok: false; error: string };

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? 0 : 4 - (value.length % 4);
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return base64ToBytes(b64);
}

function nearPublicKeyFromRaw(raw: Uint8Array): string {
  return `ed25519:${base58Encode(raw)}`;
}

export function buildTicketPassLiveMessage(input: {
  collectionId: string;
  tokenId: string;
  expMs: number;
}): string {
  return `os-pass|${input.collectionId}|${input.tokenId}|${input.expMs}`;
}

export function encodeTicketPassLivePayload(
  payload: TicketPassLivePayload
): string | null {
  const collection = payload.collectionId.trim();
  const token = payload.tokenId.trim();
  if (!collection || !token) return null;
  if (
    collection.includes('|') ||
    token.includes('|') ||
    collection.includes('\n') ||
    token.includes('\n')
  ) {
    return null;
  }
  if (!Number.isFinite(payload.expMs) || payload.expMs <= 0) return null;
  if (!payload.publicKeyB64u || !payload.nonceB64u || !payload.signatureB64u) {
    return null;
  }
  return [
    TICKET_PASS_LIVE_PREFIX,
    collection,
    token,
    String(Math.floor(payload.expMs)),
    payload.publicKeyB64u,
    payload.nonceB64u,
    payload.signatureB64u,
  ].join('|');
}

export function parseTicketPassLivePayload(
  raw: string,
  expectedCollectionId?: string | null
): TicketPassLivePayload | null {
  const value = raw.trim();
  if (!value.startsWith(`${TICKET_PASS_LIVE_PREFIX}|`)) return null;
  const parts = value.split('|');
  if (parts.length !== 7) return null;
  const [
    ,
    collectionId,
    tokenId,
    expRaw,
    publicKeyB64u,
    nonceB64u,
    signatureB64u,
  ] = parts;
  const collection = (collectionId ?? '').trim();
  const token = (tokenId ?? '').trim();
  const expMs = Number(expRaw);
  if (!collection || !token) return null;
  if (!Number.isFinite(expMs) || expMs <= 0) return null;
  if (!publicKeyB64u?.trim() || !nonceB64u?.trim() || !signatureB64u?.trim()) {
    return null;
  }
  if (!token.startsWith(`${collection}:`)) return null;
  if (
    expectedCollectionId?.trim() &&
    collection !== expectedCollectionId.trim()
  ) {
    return null;
  }
  return {
    collectionId: collection,
    tokenId: token,
    expMs: Math.floor(expMs),
    publicKeyB64u: publicKeyB64u.trim(),
    nonceB64u: nonceB64u.trim(),
    signatureB64u: signatureB64u.trim(),
  };
}

export function isTicketPassLiveFresh(
  expMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!Number.isFinite(expMs)) return false;
  if (expMs <= nowMs) return false;
  if (expMs > nowMs + TICKET_PASS_LIVE_MAX_AHEAD_MS) return false;
  return true;
}

async function verifyEd25519(
  publicKeyRaw: Uint8Array,
  signature: Uint8Array,
  messageHash: Uint8Array
): Promise<boolean> {
  if (publicKeyRaw.length !== 32 || signature.length !== 64) return false;
  // Fresh ArrayBuffer-backed views for BufferSource typing.
  const pub = new Uint8Array(publicKeyRaw.byteLength);
  pub.set(publicKeyRaw);
  const sig = new Uint8Array(signature.byteLength);
  sig.set(signature);
  const msg = new Uint8Array(messageHash.byteLength);
  msg.set(messageHash);
  const key = await crypto.subtle.importKey(
    'raw',
    pub,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  return crypto.subtle.verify({ name: 'Ed25519' }, key, sig, msg);
}

/** Silent sign with the holder's App social session key. */
export async function signTicketPassLive(input: {
  session: Session;
  collectionId: string;
  tokenId: string;
  nowMs?: number;
  ttlMs?: number;
}): Promise<string | null> {
  const collectionId = input.collectionId.trim();
  const tokenId = input.tokenId.trim();
  if (!collectionId || !tokenId) return null;
  if (collectionId.includes('|') || tokenId.includes('|')) return null;

  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? TICKET_PASS_LIVE_TTL_MS;
  const expMs = nowMs + ttlMs;
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  const message = buildTicketPassLiveMessage({
    collectionId,
    tokenId,
    expMs,
  });
  const digest = await hashNep413Payload({
    message,
    nonce,
    recipient: TICKET_PASS_LIVE_RECIPIENT,
  });
  const signature = await input.session.key.sign(digest);
  let publicKeyRaw: Uint8Array;
  try {
    publicKeyRaw = parseEd25519PublicKey(input.session.key.publicKey);
  } catch {
    return null;
  }
  return encodeTicketPassLivePayload({
    collectionId,
    tokenId,
    expMs,
    publicKeyB64u: bytesToBase64Url(publicKeyRaw),
    nonceB64u: bytesToBase64Url(nonce),
    signatureB64u: bytesToBase64Url(signature),
  });
}

/**
 * Cryptographic + freshness checks for a scanned live pass.
 * Caller still loads on-chain token status and compares owner.
 */
export async function verifyTicketPassLiveCrypto(
  raw: string,
  expectedCollectionId?: string | null,
  nowMs: number = Date.now()
): Promise<TicketPassLiveVerifyResult> {
  const payload = parseTicketPassLivePayload(raw, expectedCollectionId);
  if (!payload) {
    return { ok: false, error: 'That code is not a live Show pass.' };
  }
  if (!isTicketPassLiveFresh(payload.expMs, nowMs)) {
    return {
      ok: false,
      error: 'Pass code expired. Ask the guest to open Show pass again.',
    };
  }

  let publicKeyRaw: Uint8Array;
  let nonce: Uint8Array;
  let signature: Uint8Array;
  try {
    publicKeyRaw = base64UrlToBytes(payload.publicKeyB64u);
    nonce = base64UrlToBytes(payload.nonceB64u);
    signature = base64UrlToBytes(payload.signatureB64u);
  } catch {
    return { ok: false, error: 'Pass code is damaged.' };
  }
  if (
    publicKeyRaw.length !== 32 ||
    nonce.length !== 32 ||
    signature.length !== 64
  ) {
    return { ok: false, error: 'Pass code is damaged.' };
  }

  const message = buildTicketPassLiveMessage(payload);
  const digest = await hashNep413Payload({
    message,
    nonce,
    recipient: TICKET_PASS_LIVE_RECIPIENT,
  });
  const valid = await verifyEd25519(publicKeyRaw, signature, digest);
  if (!valid) {
    return { ok: false, error: 'Pass signature is invalid.' };
  }

  return { ok: true, payload };
}

/** Confirm the signing key is on the token owner's account. */
export async function verifyTicketPassLiveOwnerKey(
  ownerId: string,
  publicKeyB64u: string
): Promise<boolean> {
  let publicKeyRaw: Uint8Array;
  try {
    publicKeyRaw = base64UrlToBytes(publicKeyB64u);
  } catch {
    return false;
  }
  if (publicKeyRaw.length !== 32) return false;
  const nearKey = nearPublicKeyFromRaw(publicKeyRaw);
  return accountOwnsPublicKey(ownerId, nearKey);
}
