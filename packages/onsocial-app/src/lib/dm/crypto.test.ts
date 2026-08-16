import { describe, expect, it } from 'vitest';
import {
  generateDmKeyPair,
  generateDmRecoveryCode,
  openDmBytes,
  openDmText,
  recoveryCodeToWrapKey,
  sealDmBytes,
  sealDmText,
  unwrapDmSecretKey,
  wrapDmSecretKey,
} from '@/lib/dm/crypto';

describe('dm crypto', () => {
  it('seals and opens text between two keypairs', () => {
    const alice = generateDmKeyPair();
    const bob = generateDmKeyPair();
    const sealed = sealDmText({
      text: 'hello bob',
      recipientPublicKey: bob.publicKey,
      senderKeyPair: alice,
    });
    const opened = openDmText({
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      senderPubkey: sealed.senderPubkey,
      recipientSecretKey: bob.secretKey,
    });
    expect(opened.text).toBe('hello bob');

    const sentCopy = openDmText({
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      senderPubkey: sealed.senderPubkey,
      recipientSecretKey: alice.secretKey,
      senderCiphertext: sealed.senderCiphertext,
      senderNonce: sealed.senderNonce,
      viewerIsSender: true,
    });
    expect(sentCopy.text).toBe('hello bob');
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

  it('dual-seals media bytes for recipient and sender', () => {
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
    });
    expect(
      Array.from(
        openDmBytes({
          ciphertext: forBob.ciphertext,
          nonce: forBob.nonce,
          senderPubkey: alice.publicKey,
          recipientSecretKey: bob.secretKey,
        })
      )
    ).toEqual(Array.from(bytes));
    expect(
      Array.from(
        openDmBytes({
          ciphertext: forAlice.ciphertext,
          nonce: forAlice.nonce,
          senderPubkey: alice.publicKey,
          recipientSecretKey: alice.secretKey,
        })
      )
    ).toEqual(Array.from(bytes));
  });
});
