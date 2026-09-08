import { describe, expect, it } from 'vitest';
import {
  formatNearAccountDisplayName,
  formatNearAccountFallbackTitle,
  looksLikeInfrastructureAccount,
  resolveGovernanceAccountSubjectKind,
  resolveNearAccountCustomName,
} from './governance-account-subject.js';

describe('formatNearAccountFallbackTitle', () => {
  it('title-cases hyphenated contract slugs', () => {
    expect(
      formatNearAccountFallbackTitle('social-spend.onsocial.testnet')
    ).toBe('Social Spend');
  });

  it('speaks the first label on mainnet and telegram suffixes', () => {
    expect(formatNearAccountFallbackTitle('alice.near')).toBe('Alice');
    expect(formatNearAccountFallbackTitle('alice.tg')).toBe('Alice');
    expect(formatNearAccountFallbackTitle('green-ghost.near')).toBe(
      'Green Ghost'
    );
  });

  it('handles implicit accounts', () => {
    expect(formatNearAccountFallbackTitle('a'.repeat(64))).toBe(
      'Implicit account'
    );
  });
});

describe('formatNearAccountDisplayName', () => {
  it('keeps a chosen name', () => {
    expect(formatNearAccountDisplayName('alice.near', ' Night ')).toBe('Night');
    expect(resolveNearAccountCustomName('alice.near', 'Night')).toBe('Night');
  });

  it('strips id-as-name and speaks the local part', () => {
    expect(formatNearAccountDisplayName('alice.near')).toBe('Alice');
    expect(formatNearAccountDisplayName('alice.near', 'alice.near')).toBe(
      'Alice'
    );
    expect(formatNearAccountDisplayName('alice.tg', 'alice.tg')).toBe('Alice');
    expect(resolveNearAccountCustomName('alice.near', 'alice.near')).toBeNull();
  });

  it('treats implicit-account title as unset', () => {
    const implicit = 'a'.repeat(64);
    expect(formatNearAccountDisplayName(implicit)).toBe('Implicit account');
    expect(formatNearAccountDisplayName(implicit, 'Implicit account')).toBe(
      'Implicit account'
    );
    expect(formatNearAccountDisplayName(implicit, 'Custom')).toBe('Custom');
  });
});

describe('looksLikeInfrastructureAccount', () => {
  it('recognizes treasury and hyphenated contracts', () => {
    expect(looksLikeInfrastructureAccount('treasury.onsocial.testnet')).toBe(
      true
    );
    expect(
      looksLikeInfrastructureAccount('social-spend.onsocial.testnet')
    ).toBe(true);
  });

  it('leaves people alone', () => {
    expect(looksLikeInfrastructureAccount('alice.testnet')).toBe(false);
    expect(looksLikeInfrastructureAccount('greenghost.onsocial.testnet')).toBe(
      false
    );
  });
});

describe('resolveGovernanceAccountSubjectKind', () => {
  it('marks contract eyebrows as infrastructure', () => {
    expect(
      resolveGovernanceAccountSubjectKind({
        subjectEyebrow: 'Contract',
        subjectAccount: 'social-spend.onsocial.testnet',
      })
    ).toBe('infrastructure');
  });

  it('marks transfer-to-treasury as infrastructure', () => {
    expect(
      resolveGovernanceAccountSubjectKind({
        subjectEyebrow: 'To',
        targetKind: 'amount',
        subjectAccount: 'treasury.onsocial.testnet',
      })
    ).toBe('infrastructure');
  });

  it('marks contract target matches as infrastructure', () => {
    expect(
      resolveGovernanceAccountSubjectKind({
        subjectEyebrow: 'To',
        targetKind: 'contract',
        subjectAccount: 'boost.onsocial.testnet',
        targetAccountId: 'boost.onsocial.testnet',
      })
    ).toBe('infrastructure');
  });

  it('defaults members and proposers to person', () => {
    expect(
      resolveGovernanceAccountSubjectKind({
        subjectEyebrow: 'Member',
        subjectAccount: 'alice.testnet',
      })
    ).toBe('person');
  });
});
