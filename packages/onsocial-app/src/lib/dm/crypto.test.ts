import { describe, expect, it } from 'vitest';
import {
  encodeDmPublicKey,
  generateDmKeyPair,
  generateDmRecoveryCode,
  normalizeDmReplyToMessageId,
  openDmBytes,
  openDmText,
  recoveryCodeToWrapKey,
  sealDmBytes,
  sealDmText,
  unwrapDmSecretKey,
  wrapDmSecretKey,
} from '@/lib/dm/crypto';

describe('dm crypto', () => {
  it('seals and opens text with per-message ephemeral + auth tag', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const sealed = sealDmText({
      text: 'hello bob',
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
    });
    expect(sealed.v).toBe(2);
    expect(sealed.ephemeralPubkey).toBeTruthy();
    expect(sealed.authTag).toBeTruthy();

    const opened = openDmText({
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      senderPubkey: sealed.senderPubkey,
      ephemeralPubkey: sealed.ephemeralPubkey,
      authTag: sealed.authTag,
      recipientSecretKey: bob.secretKey,
    });
    expect(opened.text).toBe('hello bob');

    const sentCopy = openDmText({
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      senderPubkey: sealed.senderPubkey,
      ephemeralPubkey: sealed.ephemeralPubkey,
      authTag: sealed.authTag,
      recipientSecretKey: alice.secretKey,
      senderCiphertext: sealed.senderCiphertext,
      senderNonce: sealed.senderNonce,
      viewerIsSender: true,
    });
    expect(sentCopy.text).toBe('hello bob');
  });

  it('seals and opens an optional reply parent id', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const sealed = sealDmText({
      text: 'on my way',
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
      replyToMessageId: 'parent-1',
    });
    const opened = openDmText({
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      senderPubkey: sealed.senderPubkey,
      ephemeralPubkey: sealed.ephemeralPubkey,
      authTag: sealed.authTag,
      recipientSecretKey: bob.secretKey,
    });
    expect(opened).toEqual({
      text: 'on my way',
      replyToMessageId: 'parent-1',
    });
    expect(normalizeDmReplyToMessageId('local:pending')).toBeUndefined();
    expect(normalizeDmReplyToMessageId('parent-1')).toBe('parent-1');
  });

  it('rejects forged sender attribution via auth tag', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const mallory = generateDmKeyPair();
    const sealed = sealDmText({
      text: 'hello bob',
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
    });
    expect(() =>
      openDmText({
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        senderPubkey: encodeDmPublicKey(mallory.publicKey),
        ephemeralPubkey: sealed.ephemeralPubkey,
        authTag: sealed.authTag,
        recipientSecretKey: bob.secretKey,
      })
    ).toThrow(/authentication failed/);
  });

  it('rejects stripped auth tag on ephemeral envelopes', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const sealed = sealDmText({
      text: 'hello bob',
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
    });
    expect(() =>
      openDmText({
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        senderPubkey: sealed.senderPubkey,
        ephemeralPubkey: sealed.ephemeralPubkey,
        recipientSecretKey: bob.secretKey,
      })
    ).toThrow(/requires auth tag/);
  });

  it('binds media CIDs into the auth tag', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const sealed = sealDmText({
      text: 'with photo',
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
      mediaCids: ['cid-b', 'cid-a'],
    });
    expect(
      openDmText({
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        senderPubkey: sealed.senderPubkey,
        ephemeralPubkey: sealed.ephemeralPubkey,
        authTag: sealed.authTag,
        recipientSecretKey: bob.secretKey,
        mediaCids: ['cid-a', 'cid-b'],
      }).text
    ).toBe('with photo');
    expect(() =>
      openDmText({
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        senderPubkey: sealed.senderPubkey,
        ephemeralPubkey: sealed.ephemeralPubkey,
        authTag: sealed.authTag,
        recipientSecretKey: bob.secretKey,
        mediaCids: ['cid-swapped'],
      })
    ).toThrow(/authentication failed/);
  });

  it('opens legacy identity-key seals when ephemeral is absent', async () => {
    const nacl = (await import('tweetnacl')).default;
    const { decodeUTF8, encodeBase64 } = await import('tweetnacl-util');
    const { encodeDmPublicKey } = await import('@/lib/dm/crypto');
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const message = decodeUTF8(JSON.stringify({ text: 'legacy hello' }));
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const boxed = nacl.box(message, nonce, bob.publicKey, alice.secretKey);
    if (!boxed) throw new Error('seal failed');
    const opened = openDmText({
      ciphertext: encodeBase64(boxed),
      nonce: encodeBase64(nonce),
      senderPubkey: encodeDmPublicKey(alice.publicKey),
      recipientSecretKey: bob.secretKey,
    });
    expect(opened.text).toBe('legacy hello');
  });

  it('wraps and unwraps secret with recovery code', async () => {
    const alice = generateDmKeyPair();
    const code = generateDmRecoveryCode();
    expect(code.includes('-')).toBe(true);
    const wrapKey = await recoveryCodeToWrapKey(code);
    const wrapped = await wrapDmSecretKey({
      secretKey: alice.secretKey,
      wrapKey,
    });
    const restored = await unwrapDmSecretKey({
      ...wrapped,
      wrapKey: await recoveryCodeToWrapKey(code),
    });
    expect(Array.from(restored)).toEqual(Array.from(alice.secretKey));
  });

  it('rejects wrong recovery code', async () => {
    const alice = generateDmKeyPair();
    const wrapKey = await recoveryCodeToWrapKey('GOOD-CODE-HERE-TEST');
    const wrapped = await wrapDmSecretKey({
      secretKey: alice.secretKey,
      wrapKey,
    });
    await expect(
      unwrapDmSecretKey({
        ...wrapped,
        wrapKey: await recoveryCodeToWrapKey('BAD-CODE-HERE-TEST'),
      })
    ).rejects.toThrow(/Invalid recovery code/);
  });

  it('dual-seals media bytes with a shared ephemeral', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const bytes = new TextEncoder().encode('secret-photo');
    const forBob = sealDmBytes({
      bytes,
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
    });
    const forAlice = sealDmBytes({
      bytes,
      recipientPublicKey: alice.publicKey,
      senderKeyPair: alice,
      ephemeral: forBob.ephemeral,
    });
    expect(forAlice.ephemeralPubkey).toBe(forBob.ephemeralPubkey);
    expect(
      Array.from(
        openDmBytes({
          ciphertext: forBob.ciphertext,
          nonce: forBob.nonce,
          senderPubkey: forBob.ephemeral.publicKey,
          recipientSecretKey: bob.secretKey,
        })
      )
    ).toEqual(Array.from(bytes));
    expect(
      Array.from(
        openDmBytes({
          ciphertext: forAlice.ciphertext,
          nonce: forAlice.nonce,
          senderPubkey: forAlice.ephemeral.publicKey,
          recipientSecretKey: alice.secretKey,
        })
      )
    ).toEqual(Array.from(bytes));
  });
});
