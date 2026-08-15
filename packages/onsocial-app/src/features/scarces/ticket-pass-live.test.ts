import { describe, expect, it } from 'vitest';
import { generateEd25519Key } from '@onsocial/sdk/advanced';
import {
  encodeTicketPassLivePayload,
  isTicketPassLiveFresh,
  parseTicketPassLivePayload,
  signTicketPassLive,
  verifyTicketPassLiveCrypto,
} from '@/features/scarces/ticket-pass-live';
import { parseTicketPassPayload } from '@/features/scarces/ticket-pass-payload';

describe('ticket-pass-live', () => {
  it('round-trips encode/parse', () => {
    const encoded = encodeTicketPassLivePayload({
      collectionId: 'night-drive',
      tokenId: 'night-drive:3',
      expMs: 1_700_000_000_000,
      publicKeyB64u: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      nonceB64u: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      signatureB64u:
        'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    });
    expect(encoded?.startsWith('os2|')).toBe(true);
    expect(parseTicketPassLivePayload(encoded!)).toEqual({
      collectionId: 'night-drive',
      tokenId: 'night-drive:3',
      expMs: 1_700_000_000_000,
      publicKeyB64u: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      nonceB64u: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      signatureB64u:
        'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    });
    expect(parseTicketPassPayload(encoded!)).toEqual({
      collectionId: 'night-drive',
      tokenId: 'night-drive:3',
    });
  });

  it('rejects wrong collection and stale proofs', () => {
    const encoded = encodeTicketPassLivePayload({
      collectionId: 'night-drive',
      tokenId: 'night-drive:3',
      expMs: Date.now() + 30_000,
      publicKeyB64u: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      nonceB64u: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      signatureB64u:
        'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    });
    expect(parseTicketPassLivePayload(encoded!, 'other')).toBeNull();
    expect(isTicketPassLiveFresh(Date.now() - 1)).toBe(false);
    expect(isTicketPassLiveFresh(Date.now() + 30_000)).toBe(true);
  });

  it('signs with a session key and verifies crypto', async () => {
    const key = await generateEd25519Key();
    const session = {
      accountId: 'alice.testnet',
      network: 'testnet' as const,
      contract: 'core' as const,
      path: 'alice.testnet/',
      publicKey: key.publicKey,
      expiresAt: Date.now() + 60_000,
      key,
    };
    const nowMs = Date.now();
    const encoded = await signTicketPassLive({
      session: session as never,
      collectionId: 'night-drive',
      tokenId: 'night-drive:7',
      nowMs,
      ttlMs: 45_000,
    });
    expect(encoded).toBeTruthy();
    const verified = await verifyTicketPassLiveCrypto(
      encoded!,
      'night-drive',
      nowMs + 1_000
    );
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.tokenId).toBe('night-drive:7');
    }

    const expired = await verifyTicketPassLiveCrypto(
      encoded!,
      'night-drive',
      nowMs + 60_000
    );
    expect(expired.ok).toBe(false);
  });

  it('rejects tampered live payloads', async () => {
    const key = await generateEd25519Key();
    const session = {
      accountId: 'alice.testnet',
      network: 'testnet' as const,
      contract: 'core' as const,
      path: 'alice.testnet/',
      publicKey: key.publicKey,
      expiresAt: Date.now() + 60_000,
      key,
    };
    const encoded = await signTicketPassLive({
      session: session as never,
      collectionId: 'night-drive',
      tokenId: 'night-drive:7',
    });
    const tampered = encoded!.replace('night-drive:7', 'night-drive:8');
    const verified = await verifyTicketPassLiveCrypto(tampered, 'night-drive');
    expect(verified.ok).toBe(false);
  });
});
