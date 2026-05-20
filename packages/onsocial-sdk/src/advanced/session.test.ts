import { describe, expect, it } from 'vitest';
import {
  Session,
  buildSessionGrant,
  buildSessionRevoke,
  NeedsWalletConfirmationError,
  SessionScopeError,
} from './session.js';
import type { SessionKey } from './session-key.js';

function fakeKey(pk = 'ed25519:abc'): SessionKey {
  return {
    publicKey: pk,
    sign: async () => new Uint8Array(64), // 64 zeros, valid length
  };
}

describe('buildSessionGrant — scarces (no path/ttl, allowance only)', () => {
  it('produces a FunctionCall AddKey plan with no core actions', () => {
    const plan = buildSessionGrant({
      network: 'mainnet',
      accountId: 'alice.near',
      sessionPublicKey: 'ed25519:s1',
      contract: 'scarces',
      functionCallKey: {
        allowanceYocto: '500000000000000000000000', // 0.5 N
      },
    });

    expect(plan.accountId).toBe('alice.near');
    expect(plan.receiverId).toBe('scarces.onsocial.near');
    expect(plan.publicKey).toBe('ed25519:s1');
    expect(plan.accessKey).toEqual({
      permission: 'FunctionCall',
      receiverId: 'scarces.onsocial.near',
      methodNames: ['execute'],
      allowanceYocto: '500000000000000000000000',
    });
    expect(plan.coreActions).toEqual([]);
    expect(plan.expiresAtMs).toBeUndefined();
  });

  it('rejects path/ttl on scarces (caller bug)', () => {
    expect(() =>
      buildSessionGrant({
        network: 'mainnet',
        accountId: 'alice.near',
        sessionPublicKey: 'ed25519:s1',
        contract: 'scarces',
        path: 'irrelevant',
        functionCallKey: { allowanceYocto: '0' },
      })
    ).toThrow(SessionScopeError);
  });

  it('honours unbounded allowance (null)', () => {
    const plan = buildSessionGrant({
      network: 'testnet',
      accountId: 'alice.testnet',
      sessionPublicKey: 'ed25519:s1',
      contract: 'rewards',
      functionCallKey: {
        allowanceYocto: null,
        methodNames: ['execute', 'claim'],
      },
    });
    expect(plan.accessKey.allowanceYocto).toBeNull();
    expect(plan.accessKey.methodNames).toEqual(['execute', 'claim']);
    expect(plan.receiverId).toBe('rewards.onsocial.testnet');
  });
});

describe('buildSessionGrant — core (path + ttl)', () => {
  it('emits set_key_permission action with computed expiry', () => {
    const now = 1_700_000_000_000;
    const plan = buildSessionGrant({
      network: 'mainnet',
      accountId: 'alice.near',
      sessionPublicKey: 'ed25519:s2',
      contract: 'core',
      path: 'apps/myapp/',
      ttlMs: 60 * 60 * 1000,
      functionCallKey: { allowanceYocto: '250000000000000000000000' },
      now,
    });

    expect(plan.expiresAtMs).toBe(now + 60 * 60 * 1000);
    expect(plan.coreActions).toEqual([
      {
        type: 'set_key_permission',
        public_key: 'ed25519:s2',
        path: 'apps/myapp/',
        level: 1, // PERMISSION_LEVEL.WRITE
        expires_at: String(now + 60 * 60 * 1000),
      },
    ]);
  });

  it('includes storage deposit when requested', () => {
    const plan = buildSessionGrant({
      network: 'mainnet',
      accountId: 'alice.near',
      sessionPublicKey: 'ed25519:s2',
      contract: 'core',
      path: 'profile/',
      storageDepositYocto: '100000000000000000000000',
      functionCallKey: { allowanceYocto: '0' },
    });
    expect(plan.coreActions[0]).toEqual({
      type: 'set',
      data: { 'storage/deposit': { amount: '100000000000000000000000' } },
    });
    expect(plan.coreActions[1]?.type).toBe('set_key_permission');
  });

  it('requires path for core', () => {
    expect(() =>
      buildSessionGrant({
        network: 'mainnet',
        accountId: 'alice.near',
        sessionPublicKey: 'ed25519:s1',
        contract: 'core',
        functionCallKey: { allowanceYocto: '0' },
      })
    ).toThrow(SessionScopeError);
  });
});

describe('Session runtime', () => {
  it('exposes nonce + allowance + ttl getters', () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'scarces',
      key: fakeKey(),
      startingNonce: 5,
      remainingAllowanceYocto: '100',
    });
    expect(session.currentNonce).toBe(5);
    expect(session.allowanceYocto).toBe('100');
    expect(session.ttlMs).toBe(5 * 60 * 1000);
  });

  it('signs a delegate via signComposeDelegate and bumps the nonce', async () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'scarces',
      key: fakeKey('ed25519:11111111111111111111111111111111'),
      startingNonce: 5,
    });

    const { base64, nonce } = await session.signComposeDelegate({
      action: { type: 'transfer_scarce', token_id: 't' },
      maxBlockHeight: 1234n,
    });

    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);
    expect(nonce).toBe(5);
    expect(session.currentNonce).toBe(6);
  });

  it('bumps nonce above the NEAR access-key block-height floor', () => {
    const session = new Session({
      network: 'testnet',
      accountId: 'alice.testnet',
      contract: 'core',
      key: fakeKey(),
      startingNonce: 1_779_296_611_546,
    });

    session.ensureNonceAboveAccessKeyFloor(251_173_172n);

    expect(session.currentNonce).toBe(251_173_172_000_001);
  });

  it('rejects attached deposits for FunctionCall-key sessions', async () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'scarces',
      key: fakeKey('ed25519:11111111111111111111111111111111'),
    });

    await expect(
      session.signComposeDelegate({
        action: { type: 'accept_transfer', token_id: 't' },
        maxBlockHeight: 1234n,
        depositYocto: '1',
      })
    ).rejects.toMatchObject({ reason: 'attached_deposit_required' });
  });

  it('allows attached deposits when the delegate signer is FullAccess-capable', async () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'scarces',
      key: fakeKey('ed25519:11111111111111111111111111111111'),
      canAttachDeposit: true,
    });

    await expect(
      session.signComposeDelegate({
        action: { type: 'accept_transfer', token_id: 't' },
        maxBlockHeight: 1234n,
        depositYocto: '1',
      })
    ).resolves.toMatchObject({ nonce: 1 });
  });

  it('debitAllowance throws when budget exhausted and leaves balance untouched', () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'scarces',
      key: fakeKey(),
      remainingAllowanceYocto: '100',
    });
    session.debitAllowance('60');
    expect(session.allowanceYocto).toBe('40');
    expect(() => session.debitAllowance('50')).toThrowError(
      NeedsWalletConfirmationError
    );
    expect(session.allowanceYocto).toBe('40');
  });

  it('debitAllowance is a no-op when allowance was unbounded', () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'core',
      key: fakeKey(),
      remainingAllowanceYocto: null,
    });
    session.debitAllowance('999999999999999');
    expect(session.allowanceYocto).toBeNull();
  });

  it('rewindNonce decrements but never goes below 1', () => {
    const session = new Session({
      network: 'mainnet',
      accountId: 'alice.near',
      contract: 'core',
      key: fakeKey(),
      startingNonce: 1,
    });
    session.rewindNonce();
    expect(session.currentNonce).toBe(1);
  });
});

describe('buildSessionRevoke', () => {
  it('returns no core actions for non-core contracts', () => {
    const plan = buildSessionRevoke({
      publicKey: 'ed25519:s1',
      contract: 'scarces',
    });
    expect(plan.publicKey).toBe('ed25519:s1');
    expect(plan.coreActions).toEqual([]);
  });

  it('clears the registry entry for core', () => {
    const plan = buildSessionRevoke({
      publicKey: 'ed25519:s1',
      contract: 'core',
      path: 'apps/myapp/',
    });
    expect(plan.coreActions).toEqual([
      {
        type: 'set_key_permission',
        public_key: 'ed25519:s1',
        path: 'apps/myapp/',
        level: 0,
        expires_at: '0',
      },
    ]);
  });

  it('requires path for core', () => {
    expect(() =>
      buildSessionRevoke({ publicKey: 'ed25519:s1', contract: 'core' })
    ).toThrow(SessionScopeError);
  });
});
