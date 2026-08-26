import { describe, expect, it } from 'vitest';
import {
  formatNearAccountFallbackTitle,
  looksLikeInfrastructureAccount,
  resolveGovernanceAccountSubjectKind,
} from './governance-account-subject.js';

describe('formatNearAccountFallbackTitle', () => {
  it('title-cases hyphenated contract slugs', () => {
    expect(formatNearAccountFallbackTitle('social-spend.onsocial.testnet')).toBe(
      'Social Spend'
    );
  });

  it('handles implicit accounts', () => {
    expect(formatNearAccountFallbackTitle('a'.repeat(64))).toBe(
      'Implicit account'
    );
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
    expect(
      looksLikeInfrastructureAccount('greenghost.onsocial.testnet')
    ).toBe(false);
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
